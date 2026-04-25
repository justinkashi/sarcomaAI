import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const API = 'http://localhost:5050';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [config, setConfig] = useState({ institution: '', dicomFolder: '', stsDataset: '', isNewDataset: null });
  const [patientTree, setPatientTree] = useState({});
  const [selections, setSelections] = useState({});
  const [currentPatient, setCurrentPatient] = useState(null);
  const [currentStudy, setCurrentStudy] = useState(null);
  const [currentSeries, setCurrentSeries] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [fileCount, setFileCount] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [seriesMetadata, setSeriesMetadata] = useState(null);
  const [pipelineState, setPipelineState] = useState('idle');
  const [pipelineLog, setPipelineLog] = useState([]);
  const [savedAt, setSavedAt] = useState(null);

  const totalStudies = useMemo(
    () => Object.values(patientTree).reduce((sum, arr) => sum + arr.length, 0),
    [patientTree]
  );

  const completeStudies = useMemo(
    () => Object.values(selections).filter(sel => sel && sel.t1 && sel.t2).length,
    [selections]
  );

  const allComplete = useMemo(
    () => totalStudies > 0 && completeStudies === totalStudies,
    [totalStudies, completeStudies]
  );

  const loadPatients = useCallback(async () => { // eslint-disable-line react-hooks/exhaustive-deps
    const res = await fetch(`${API}/api/patients`);
    const paths = await res.json();
    const tree = {};
    paths.forEach(p => {
      const [pt, st] = p.split('/');
      if (!tree[pt]) tree[pt] = [];
      if (!tree[pt].includes(st)) tree[pt].push(st);
    });
    setPatientTree(tree);

    const allSels = {};
    for (const path of paths) {
      const [pt, st] = path.split('/');
      try {
        const r = await fetch(`${API}/api/get-selection?patient=${pt}/${st}`);
        const data = await r.json();
        allSels[`${pt}/${st}`] = { t1: data.t1 || null, t2: data.t2 || null };
      } catch {
        allSels[`${pt}/${st}`] = { t1: null, t2: null };
      }
    }
    setSelections(allSels);

    const firstIncomplete = paths.find(p => {
      const sel = allSels[p];
      return !sel || !sel.t1 || !sel.t2;
    });
    const target = firstIncomplete || paths[0];
    if (target) {
      const [pt, st] = target.split('/');
      const serRes = await fetch(`${API}/api/series?patient=${pt}/${st}`);
      const serData = await serRes.json();
      setCurrentPatient(pt);
      setCurrentStudy(st);
      setSeriesList(serData);
      if (serData.length > 0) {
        setCurrentSeries(serData[0]);
        fetchSeriesInfo(pt, st, serData[0]);
      }
    }
  }, []);

  const fetchSeriesInfo = useCallback(async (patient, study, series) => {
    try {
      const maxRes = await fetch(`${API}/api/max-slice?patient=${patient}/${study}&series=${series}`);
      const maxData = await maxRes.json();
      setFileCount(maxData.maxSlice || 0);
      setSliceIndex(0);
    } catch {
      setFileCount(0);
    }
    try {
      const metaRes = await fetch(`${API}/api/series-metadata?patient=${patient}/${study}&series=${series}`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        setSeriesMetadata(meta);
      } else {
        setSeriesMetadata(null);
      }
    } catch {
      setSeriesMetadata(null);
    }
  }, []);

  const configure = useCallback(async (cfg) => {
    const res = await fetch(`${API}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institution: cfg.institution,
        dicomFolder: cfg.dicomFolder,
        stsDataset: cfg.stsDataset,
        isNewDataset: cfg.isNewDataset,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }
    setConfig(cfg);
    localStorage.setItem('sarcomaai_last_config', JSON.stringify(cfg));
    setIsConfigured(true);
    await loadPatients();
  }, [loadPatients]);

  const navigateTo = useCallback(async (patient, study, series) => {
    setCurrentPatient(patient);
    setCurrentStudy(study);
    if (patient && study) {
      try {
        const res = await fetch(`${API}/api/series?patient=${patient}/${study}`);
        const data = await res.json();
        setSeriesList(data);
        const targetSeries = series || (data.length > 0 ? data[0] : null);
        setCurrentSeries(targetSeries);
        if (targetSeries) {
          await fetchSeriesInfo(patient, study, targetSeries);
        }
      } catch {
        setSeriesList([]);
      }
    }
  }, [fetchSeriesInfo]);

  const selectSeries = useCallback(async (series) => {
    setCurrentSeries(series);
    if (currentPatient && currentStudy) {
      await fetchSeriesInfo(currentPatient, currentStudy, series);
    }
  }, [currentPatient, currentStudy, fetchSeriesInfo]);

  const selectModality = useCallback(async (type, seriesName) => {
    if (!currentPatient || !currentStudy) return;
    const key = `${currentPatient}/${currentStudy}`;
    const current = selections[key] || { t1: null, t2: null };

    let newT1 = current.t1;
    let newT2 = current.t2;

    if (type === 't1') {
      newT1 = current.t1 === seriesName ? null : seriesName;
    } else {
      newT2 = current.t2 === seriesName ? null : seriesName;
    }

    const newSel = { t1: newT1, t2: newT2 };
    setSelections(prev => ({ ...prev, [key]: newSel }));
    setSavedAt(null);

    await fetch(`${API}/api/save-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient: key, t1: newT1, t2: newT2 }),
    });
    setSavedAt(Date.now());

    if (newT1 && newT2) {
      const allPaths = Object.entries(patientTree).flatMap(([pt, studies]) =>
        studies.map(st => ({ pt, st }))
      );
      const nextIncomplete = allPaths.find(({ pt, st }) => {
        if (pt === currentPatient && st === currentStudy) return false;
        const s = selections[`${pt}/${st}`];
        return !s || !s.t1 || !s.t2;
      });
      if (nextIncomplete) {
        await navigateTo(nextIncomplete.pt, nextIncomplete.st, null);
      }
    }
  }, [currentPatient, currentStudy, selections, patientTree, navigateTo]);

  const undoSelection = useCallback(async () => {
    if (!currentPatient || !currentStudy) return;
    const key = `${currentPatient}/${currentStudy}`;
    setSelections(prev => ({ ...prev, [key]: { t1: null, t2: null } }));
    await fetch(`${API}/api/save-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient: key, t1: null, t2: null }),
    });
    setSavedAt(null);
  }, [currentPatient, currentStudy]);

  const startPipeline = useCallback(() => {
    setPipelineState('running');
    setPipelineLog([]);
    const es = new EventSource(`${API}/api/run-pipeline-stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) {
        es.close();
        if (data.returncode === 0) {
          setPipelineState('done');
          setPipelineLog(prev => [...prev, { text: 'Processing complete. Check your STS dataset folder for output.', type: 'success' }]);
        } else {
          setPipelineState('error');
          setPipelineLog(prev => [...prev, { text: `Pipeline exited with code ${data.returncode}`, type: 'error' }]);
        }
      } else if (data.line !== undefined) {
        const lower = data.line.toLowerCase();
        const type = lower.includes('error') || lower.includes('fail') ? 'error'
          : lower.includes('success') || lower.includes('done') || lower.includes('complete') ? 'success'
          : 'info';
        setPipelineLog(prev => [...prev, { text: data.line, type }]);
      }
    };
    es.onerror = () => {
      es.close();
      setPipelineState('error');
      setPipelineLog(prev => [...prev, { text: 'Connection to pipeline stream lost.', type: 'error' }]);
    };
  }, []);

  const value = {
    isConfigured, config, patientTree, selections,
    currentPatient, currentStudy, currentSeries,
    seriesList, fileCount, sliceIndex, setSliceIndex,
    seriesMetadata, pipelineState, setPipelineState,
    pipelineLog, savedAt,
    totalStudies, completeStudies, allComplete,
    configure, loadPatients, navigateTo, selectSeries,
    selectModality, undoSelection, startPipeline,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export default AppContext;

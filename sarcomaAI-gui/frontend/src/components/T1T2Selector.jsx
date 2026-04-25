import React, { useEffect, useState } from "react";

const API = "http://localhost:5050";

export default function T1T2Selector() {
  // ----------------------------- WIZARD STATE -----------------------------
  const institutions = {
    "Memorial Sloan Kettering Cancer Center": "001",
    "McGill University Health Centre": "002",
  };
  const [inputInstitution, setInputInstitution]       = useState("");
  const [inputDicomFolder, setInputDicomFolder]       = useState("");
  const [inputIsNewDataset, setInputIsNewDataset]     = useState(null);
  const [inputStsDataset, setInputStsDataset]         = useState("");
  const [setupConfirmed, setSetupConfirmed]           = useState(false);
  const [setupError, setSetupError]                   = useState("");

  const wizardValid =
    inputInstitution &&
    inputDicomFolder &&
    inputIsNewDataset !== null &&
    inputStsDataset;

  // ----------------------------- VIEWER STATE -----------------------------
  const [patientToStudies, setPatientToStudies] = useState({});
  const [currentPatient, setCurrentPatient]     = useState("");
  const [currentStudy, setCurrentStudy]         = useState("");
  const [seriesList, setSeriesList]             = useState([]);
  const [currentSeriesIdx, setCurrentSeriesIdx] = useState(0);
  const [sliceIndex, setSliceIndex]             = useState(0);
  const [maxSlice, setMaxSlice]                 = useState(1);
  const [imageURL, setImageURL]                 = useState(null);
  const [allSelections, setAllSelections]       = useState({});
  const [selectedT1, setSelectedT1]             = useState(null);
  const [selectedT2, setSelectedT2]             = useState(null);
  const [isMagnified, setIsMagnified]           = useState(false);

  // ----------------------------- PIPELINE STATE ---------------------------
  const [pipelineRunning, setPipelineRunning]   = useState(false);
  const [pipelineOutput, setPipelineOutput]     = useState(null);

  const currentSeries = seriesList[currentSeriesIdx] || "";
  const totalStudies  = Object.values(patientToStudies).reduce((sum, arr) => sum + arr.length, 0);
  const pipelineReady =
    setupConfirmed &&
    Object.keys(allSelections).length === totalStudies &&
    totalStudies > 0 &&
    Object.values(allSelections).every(sel => sel.t1 && sel.t2);

  // ----------------------------- SETUP CONFIRM ----------------------------
  const handleConfirmSetup = () => {
    setSetupError("");
    fetch(`${API}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institution:    institutions[inputInstitution],
        dicomFolder:    inputDicomFolder,
        stsDataset:     inputStsDataset,
        isNewDataset:   inputIsNewDataset,
      }),
    })
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json();
      })
      .then(() => setSetupConfirmed(true))
      .catch(e => setSetupError(e.message));
  };

  // ----------------------------- API CALLS --------------------------------
  useEffect(() => {
    if (!setupConfirmed) return;
    fetch(`${API}/api/patients`)
      .then(r => r.json())
      .then(paths => {
        const map = {};
        paths.forEach(p => {
          const [pt, st] = p.split("/");
          if (!map[pt]) map[pt] = [];
          if (!map[pt].includes(st)) map[pt].push(st);
        });
        setPatientToStudies(map);
        const first = Object.keys(map)[0];
        if (first) {
          setCurrentPatient(first);
          setCurrentStudy(map[first][0]);
        }
      })
      .catch(console.warn);
  }, [setupConfirmed]);

  useEffect(() => {
    if (!setupConfirmed || !currentPatient || !currentStudy) return;
    fetch(`${API}/api/series?patient=${currentPatient}/${currentStudy}`)
      .then(r => r.json())
      .then(setSeriesList)
      .catch(console.warn);
    fetch(`${API}/api/get-selection?patient=${currentPatient}/${currentStudy}`)
      .then(r => r.json())
      .then(data => {
        setSelectedT1(data.t1 || null);
        setSelectedT2(data.t2 || null);
        setAllSelections(prev => ({
          ...prev,
          [`${currentPatient}/${currentStudy}`]: { t1: data.t1 || null, t2: data.t2 || null }
        }));
      })
      .catch(console.warn);
  }, [setupConfirmed, currentPatient, currentStudy]);

  useEffect(() => {
    if (!setupConfirmed || !currentSeries) return;
    fetch(`${API}/api/max-slice?patient=${currentPatient}/${currentStudy}&series=${currentSeries}`)
      .then(r => r.json())
      .then(data => { setMaxSlice(data.maxSlice); setSliceIndex(0); })
      .catch(console.warn);
  }, [setupConfirmed, currentPatient, currentStudy, currentSeries]);

  useEffect(() => {
    if (!setupConfirmed || !currentSeries) return;
    fetch(`${API}/api/slice?patient=${currentPatient}/${currentStudy}&series=${currentSeries}&slice=${sliceIndex}`)
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => setImageURL(URL.createObjectURL(blob)))
      .catch(console.warn);
  }, [setupConfirmed, currentPatient, currentStudy, currentSeries, sliceIndex]);

  useEffect(() => {
    if (!setupConfirmed) return;
    const onKey = e => {
      if (e.key === 'ArrowLeft')  setSliceIndex(i => Math.max(i - 1, 0));
      if (e.key === 'ArrowRight') setSliceIndex(i => Math.min(i + 1, maxSlice - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setupConfirmed, maxSlice]);

  // ----------------------------- SELECTION --------------------------------
  const handleSelect = type => {
    if (!currentSeries) return;
    const newT1 = type === 'T1' ? (selectedT1 === currentSeries ? null : currentSeries) : selectedT1;
    const newT2 = type === 'T2' ? (selectedT2 === currentSeries ? null : currentSeries) : selectedT2;
    setSelectedT1(newT1);
    setSelectedT2(newT2);
    const key = `${currentPatient}/${currentStudy}`;
    setAllSelections(prev => ({ ...prev, [key]: { t1: newT1, t2: newT2 } }));
    fetch(`${API}/api/save-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient: key, t1: newT1, t2: newT2 }),
    }).catch(console.warn);
  };

  const navPatient = delta => {
    const keys = Object.keys(patientToStudies);
    const idx  = keys.indexOf(currentPatient);
    const next = keys[(idx + delta + keys.length) % keys.length];
    setCurrentPatient(next);
    setCurrentStudy(patientToStudies[next][0]);
    setSeriesList([]);
    setCurrentSeriesIdx(0);
  };

  // ----------------------------- PIPELINE ---------------------------------
  const handleStartPipeline = () => {
    setPipelineRunning(true);
    setPipelineOutput(null);
    fetch(`${API}/api/run-pipeline`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setPipelineOutput(data);
        setPipelineRunning(false);
      })
      .catch(e => {
        setPipelineOutput({ success: false, stderr: e.message, stdout: '' });
        setPipelineRunning(false);
      });
  };

  // ----------------------------- RENDER -----------------------------------
  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: 'auto', position: 'relative' }}>

      {/* Wizard */}
      {!setupConfirmed && (
        <div style={{ maxWidth: 600 }}>
          <h2>SarcomaAI Setup</h2>

          <label>Institution</label><br />
          <select value={inputInstitution} onChange={e => setInputInstitution(e.target.value)} style={{ marginBottom: 16 }}>
            <option value="" disabled>-- Select Institution --</option>
            {Object.keys(institutions).map(n => <option key={n} value={n}>{n}</option>)}
          </select><br />

          <label>Full path to your DICOM folder (the folder containing PA-numbered subfolders)</label><br />
          <input
            type="text"
            value={inputDicomFolder}
            onChange={e => setInputDicomFolder(e.target.value)}
            placeholder="/path/to/Dataset/DICOM"
            style={{ width: '100%', marginBottom: 16, padding: '0.4rem' }}
          /><br />

          <label>New dataset or add to existing SarcomaAI dataset?</label><br />
          <button
            onClick={() => setInputIsNewDataset(true)}
            style={{ background: inputIsNewDataset === true ? '#2563eb' : '#f3f4f6', color: inputIsNewDataset === true ? '#fff' : '#000', marginRight: 8 }}
          >New dataset</button>
          <button
            onClick={() => setInputIsNewDataset(false)}
            style={{ background: inputIsNewDataset === false ? '#2563eb' : '#f3f4f6', color: inputIsNewDataset === false ? '#fff' : '#000' }}
          >Existing dataset</button><br /><br />

          {inputIsNewDataset === true && (
            <>
              <label>Full path where the new SarcomaAI dataset should be created</label><br />
              <input
                type="text"
                value={inputStsDataset}
                onChange={e => setInputStsDataset(e.target.value)}
                placeholder="/path/to/STS_Dataset"
                style={{ width: '100%', marginBottom: 16, padding: '0.4rem' }}
              />
            </>
          )}
          {inputIsNewDataset === false && (
            <>
              <label>Full path to your existing SarcomaAI dataset folder</label><br />
              <input
                type="text"
                value={inputStsDataset}
                onChange={e => setInputStsDataset(e.target.value)}
                placeholder="/path/to/existing/STS_Dataset"
                style={{ width: '100%', marginBottom: 16, padding: '0.4rem' }}
              />
            </>
          )}

          {setupError && <p style={{ color: 'red' }}>{setupError}</p>}

          <button
            onClick={handleConfirmSetup}
            disabled={!wizardValid}
            style={{ padding: '0.6rem 1.5rem', background: wizardValid ? '#16a34a' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 5, cursor: wizardValid ? 'pointer' : 'not-allowed' }}
          >Confirm Setup</button>
        </div>
      )}

      {/* Viewer */}
      {setupConfirmed && (
        <div>
          {/* Patient / Study navigation */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div>
              <select
                value={currentPatient}
                onChange={e => {
                  const p = e.target.value;
                  setCurrentPatient(p);
                  setCurrentStudy(patientToStudies[p][0]);
                  setCurrentSeriesIdx(0);
                }}
                style={{ fontSize: 18, padding: '0.5rem 1rem', marginRight: '1rem' }}
              >
                {Object.keys(patientToStudies).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={currentStudy}
                onChange={e => { setCurrentStudy(e.target.value); setCurrentSeriesIdx(0); }}
                style={{ fontSize: 18, padding: '0.5rem 1rem' }}
              >
                {patientToStudies[currentPatient]?.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button onClick={() => navPatient(-1)} disabled={Object.keys(patientToStudies).length <= 1}>⬅ Previous Patient</button>
              <button onClick={() => navPatient(1)}  disabled={Object.keys(patientToStudies).length <= 1} style={{ marginLeft: '1rem' }}>Next Patient ➡</button>
            </div>
          </div>

          {/* Series list + slice viewer */}
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginRight: '2rem', minWidth: 160 }}>
              {seriesList.map((series, idx) => {
                const isT1     = selectedT1 === series;
                const isT2     = selectedT2 === series;
                const isActive = idx === currentSeriesIdx;
                return (
                  <div key={series} style={{ position: 'relative' }}>
                    <button
                      onClick={() => setCurrentSeriesIdx(idx)}
                      style={{
                        width: '100%', padding: '0.5rem',
                        backgroundColor: isActive ? '#2563eb' : '#f3f4f6',
                        color: isActive ? 'white' : 'black', border: '1px solid #ccc', borderRadius: 5,
                      }}
                    >{series}</button>
                    {isT1 && <div style={{ position: 'absolute', top: -6, left: -6, background: 'red',  color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4 }}>T1</div>}
                    {isT2 && <div style={{ position: 'absolute', bottom: -6, left: -6, background: 'blue', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4 }}>T2</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ flexGrow: 1 }}>
              <div style={{ marginBottom: '1rem' }}>
                <strong>Slice:</strong>
                <input type="range" min={0} max={maxSlice - 1} value={sliceIndex}
                  onChange={e => setSliceIndex(+e.target.value)} style={{ width: '100%' }} />
                <div>{sliceIndex} / {maxSlice - 1}</div>
              </div>
              <div style={{ width: 300, height: 300, position: 'relative' }}>
                <div style={{ border: '1px solid #ccc', background: '#f9fafb', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imageURL
                    ? <img src={imageURL} alt='' style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <p>No image</p>}
                </div>
                <button onClick={() => setIsMagnified(true)} style={{ position: 'absolute', bottom: 5, right: 5 }}>🔍</button>
              </div>
            </div>
          </div>

          {/* T1/T2 buttons */}
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={() => handleSelect('T1')} style={{ marginRight: '1rem' }}>
              {selectedT1 === currentSeries ? '✅ Unselect T1' : 'Select as T1'}
            </button>
            <button onClick={() => handleSelect('T2')}>
              {selectedT2 === currentSeries ? '✅ Unselect T2' : 'Select as T2'}
            </button>
          </div>

          {/* Magnifier modal */}
          {isMagnified && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ position: 'relative', width: '80%', maxWidth: 800, background: '#000', padding: 16 }}>
                <img src={imageURL} alt='' style={{ width: '100%', objectFit: 'contain' }} />
                <button onClick={() => setIsMagnified(false)} style={{ position: 'absolute', top: 10, right: 10, background: '#f87171', border: 'none', padding: '0.5rem 1rem', color: '#fff', borderRadius: 5 }}>✖</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start Pipeline button */}
      {pipelineReady && !pipelineOutput && (
        <button
          onClick={handleStartPipeline}
          disabled={pipelineRunning}
          style={{
            position: 'fixed', bottom: 20, right: 20,
            padding: '0.8rem 1.5rem', fontSize: 16,
            background: pipelineRunning ? '#9ca3af' : '#16a34a',
            color: '#fff', border: 'none', borderRadius: 8, cursor: pipelineRunning ? 'wait' : 'pointer',
          }}
        >
          {pipelineRunning ? 'Running...' : 'Start Pipeline'}
        </button>
      )}

      {/* Pipeline output */}
      {pipelineOutput && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: pipelineOutput.success ? '#f0fdf4' : '#fef2f2',
          borderTop: `2px solid ${pipelineOutput.success ? '#16a34a' : '#dc2626'}`,
          padding: '1rem', maxHeight: '40vh', overflowY: 'auto', zIndex: 1000,
        }}>
          <strong style={{ color: pipelineOutput.success ? '#15803d' : '#dc2626' }}>
            {pipelineOutput.success ? 'Pipeline completed successfully' : 'Pipeline failed'}
          </strong>
          <button onClick={() => setPipelineOutput(null)} style={{ float: 'right', cursor: 'pointer' }}>✖ Close</button>
          {pipelineOutput.stdout && (
            <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>{pipelineOutput.stdout}</pre>
          )}
          {pipelineOutput.stderr && (
            <pre style={{ marginTop: 8, fontSize: 12, color: '#dc2626', whiteSpace: 'pre-wrap' }}>{pipelineOutput.stderr}</pre>
          )}
        </div>
      )}
    </div>
  );
}

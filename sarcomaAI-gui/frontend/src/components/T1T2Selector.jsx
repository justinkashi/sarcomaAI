import React, { useEffect, useState } from "react";

export default function T1T2Selector() {
  // ----------------------------- WIZARD STATE -----------------------------
  const institutions = {
    "Memorial Sloan Kettering Cancer Center": "001",
    "McGill University Health Centre": "002",
  };
  const [inputInstitution, setInputInstitution] = useState("");
  const [inputDatasetPath, setInputDatasetPath] = useState("");
  const [inputIsNewDataset, setInputIsNewDataset] = useState(null);
  const [inputSaveLocationPath, setInputSaveLocationPath] = useState("");
  const [inputExistingDatasetPath, setInputExistingDatasetPath] = useState("");

  const setupComplete =
    inputInstitution &&
    inputDatasetPath &&
    inputIsNewDataset !== null &&
    (inputIsNewDataset ? inputSaveLocationPath : inputExistingDatasetPath);

  // ----------------------------- VIEWER STATE -----------------------------
  const [patientToStudies, setPatientToStudies] = useState({});
  const [currentPatient, setCurrentPatient] = useState("");
  const [currentStudy, setCurrentStudy] = useState("");
  const [seriesList, setSeriesList] = useState([]);
  const [currentSeriesIdx, setCurrentSeriesIdx] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [maxSlice, setMaxSlice] = useState(1);
  const [imageURL, setImageURL] = useState(null);
  const [allSelections, setAllSelections] = useState({});
  const [selectedT1, setSelectedT1] = useState(null);
  const [selectedT2, setSelectedT2] = useState(null);
  const [isMagnified, setIsMagnified] = useState(false);

  const currentSeries = seriesList[currentSeriesIdx] || "";
  const totalStudies = Object.values(patientToStudies).reduce((sum, arr) => sum + arr.length, 0);
  const pipelineReady =
    setupComplete &&
    Object.keys(allSelections).length === totalStudies &&
    Object.values(allSelections).every(sel => sel.t1 && sel.t2);

  // ----------------------------- HELPERS -----------------------------
  const handleFolderSelect = (e, setter) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const path = files[0].webkitRelativePath || files[0].name;
    const folder = path.split("/")[0];
    setter(folder);
  };

  // ----------------------------- API CALLS -----------------------------
  useEffect(() => {
    if (!setupComplete) return;
    fetch("http://localhost:5050/api/patients")
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
        setCurrentPatient(first);
        setCurrentStudy(map[first][0]);
      })
      .catch(console.warn);
  }, [setupComplete]);

  useEffect(() => {
    if (!setupComplete || !currentPatient || !currentStudy) return;
    fetch(`http://localhost:5050/api/series?patient=${currentPatient}/${currentStudy}`)
      .then(r => r.json())
      .then(setSeriesList)
      .catch(console.warn);
    fetch(`http://localhost:5050/api/get-selection?patient=${currentPatient}/${currentStudy}`)
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
  }, [setupComplete, currentPatient, currentStudy]);

  useEffect(() => {
    if (!setupComplete || !currentSeries) return;
    fetch(
      `http://localhost:5050/api/max-slice?patient=${currentPatient}/${currentStudy}&series=${currentSeries}`
    )
      .then(r => r.json())
      .then(data => { setMaxSlice(data.maxSlice); setSliceIndex(0); })
      .catch(console.warn);
  }, [setupComplete, currentPatient, currentStudy, currentSeries]);

  useEffect(() => {
    if (!setupComplete || !currentSeries) return;
    fetch(
      `http://localhost:5050/api/slice?patient=${currentPatient}/${currentStudy}&series=${currentSeries}&slice=${sliceIndex}`
    )
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => setImageURL(URL.createObjectURL(blob)))
      .catch(console.warn);
  }, [setupComplete, currentPatient, currentStudy, currentSeries, sliceIndex]);

  // Keyboard nav
  useEffect(() => {
    if (!setupComplete) return;
    const onKey = e => {
      if (e.key === 'ArrowLeft') setSliceIndex(i => Math.max(i - 1, 0));
      if (e.key === 'ArrowRight') setSliceIndex(i => Math.min(i + 1, maxSlice - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setupComplete, maxSlice]);

  // Save selection handler
  const handleSelect = type => {
    if (!currentSeries) return;
    const newT1 = type === 'T1' ? (selectedT1 === currentSeries ? null : currentSeries) : selectedT1;
    const newT2 = type === 'T2' ? (selectedT2 === currentSeries ? null : currentSeries) : selectedT2;
    setSelectedT1(newT1);
    setSelectedT2(newT2);
    const key = `${currentPatient}/${currentStudy}`;
    setAllSelections(prev => ({ ...prev, [key]: { t1: newT1, t2: newT2 } }));
    fetch('http://localhost:5050/api/save-selection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient: key, t1: newT1, t2: newT2 })
    }).catch(console.warn);
  };

  const navPatient = delta => {
    const keys = Object.keys(patientToStudies);
    const idx = keys.indexOf(currentPatient);
    const next = keys[(idx + delta + keys.length) % keys.length];
    setCurrentPatient(next);
    setCurrentStudy(patientToStudies[next][0]);
    setSeriesList([]);
    setCurrentSeriesIdx(0);
  };

  const handleStartPipeline = () => {
    const args = [
      institutions[inputInstitution],
      inputDatasetPath,
      inputIsNewDataset,
      inputIsNewDataset ? inputSaveLocationPath : inputExistingDatasetPath,
      'path/to/selection.csv'
    ];
    console.log('Starting pipeline with args:', args);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: 'auto', position: 'relative' }}>
      {/* Wizard */}
      {!setupComplete && (
        <div>
          <label>Please select your institution</label><br />
          <select value={inputInstitution} onChange={e => setInputInstitution(e.target.value)}>
            <option value="" disabled>-- Select Institution --</option>
            {Object.keys(institutions).map(n => <option key={n} value={n}>{n}</option>)}
          </select><br /><br />

          <label>Select the folder containing the STS DICOMs you would like to process</label><br />
          <input
            type="file"
            ref={el => el && el.setAttribute('webkitdirectory', '')}
            multiple
            onChange={e => handleFolderSelect(e, setInputDatasetPath)}
          />
          {inputDatasetPath && <p>Selected: {inputDatasetPath}</p>}<br />

          <label>New dataset or add to existing SarcomaAI dataset?</label><br />
          <button onClick={() => setInputIsNewDataset(true)}>New dataset</button>
          <button onClick={() => setInputIsNewDataset(false)} style={{ marginLeft: 8 }}>Existing dataset</button><br /><br />

          {inputIsNewDataset !== null && (inputIsNewDataset ? (
            <>
              <label>Select where to save the SarcomaAI dataset</label><br />
              <input
                type="file"
                ref={el => el && el.setAttribute('webkitdirectory', '')}
                multiple
                onChange={e => handleFolderSelect(e, setInputSaveLocationPath)}
              />
              {inputSaveLocationPath && <p>Selected: {inputSaveLocationPath}</p>}
            </>
          ) : (
            <>
              <label>Select the folder containing your existing SarcomaAI dataset</label><br />
              <input
                type="file"
                ref={el => el && el.setAttribute('webkitdirectory', '')}
                multiple
                onChange={e => handleFolderSelect(e, setInputExistingDatasetPath)}
              />
              {inputExistingDatasetPath && <p>Selected: {inputExistingDatasetPath}</p>}
            </>
          ))}
        </div>
      )}

      {/* Viewer */}
      {setupComplete && (
        <div>
          
          {/* Dropdowns and Patient Navigation */}
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
              <button onClick={() => navPatient(1)} disabled={Object.keys(patientToStudies).length <= 1} style={{ marginLeft: '1rem' }}>Next Patient ➡</button>
            </div>
          </div>

          {/* Series list and slice viewer */}
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginRight: '2rem' }}>
              {seriesList.map((series, idx) => {
                const isT1 = selectedT1 === series;
                const isT2 = selectedT2 === series;
                const isActive = idx === currentSeriesIdx;
                return (
                  <div key={series} style={{ position: 'relative' }}>
                    <button
                      onClick={() => setCurrentSeriesIdx(idx)}
                      style={{
                        width: '100%', padding: '0.5rem',
                        backgroundColor: isActive ? '#2563eb' : '#f3f4f6',
                        color: isActive ? 'white' : 'black', border: '1px solid #ccc', borderRadius: 5
                      }}
                    >{series}</button>
                    {isT1 && <div style={{ position: 'absolute', top: -6, left: -6, background: 'red', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4 }}>T1</div>}
                    {isT2 && <div style={{ position: 'absolute', bottom: -6, left: -6, background: 'blue', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4 }}>T2</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ flexGrow: 1 }}>
              <div style={{ marginBottom: '1rem' }}>
                <strong>Slice:</strong>
                <input
                  type="range" min={0} max={maxSlice - 1} value={sliceIndex}
                  onChange={e => setSliceIndex(+e.target.value)} style={{ width: '100%' }}
                />
                <div>{sliceIndex} / {maxSlice - 1}</div>
              </div>
              <div style={{ width: 300, height: 300, position: 'relative' }}>
                <div style={{ border: '1px solid #ccc', background: '#f9fafb', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imageURL ? <img src={imageURL} alt='' style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <p>No image</p>}
                </div>
                <button onClick={() => setIsMagnified(true)} style={{ position: 'absolute', bottom: 5, right: 5 }}>🔍</button>
              </div>
            </div>
          </div>

          {/* T1/T2 selection buttons */}
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={() => handleSelect('T1')} style={{ marginRight: '1rem' }}>{selectedT1 === currentSeries ? '✅ Unselect T1' : 'Select as T1'}</button>
            <button onClick={() => handleSelect('T2')}>{selectedT2 === currentSeries ? '✅ Unselect T2' : 'Select as T2'}</button>
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

      {/* Start Pipeline */}
      {pipelineReady && (
        <button
          onClick={handleStartPipeline}
          style={{ position: 'fixed', bottom: 20, right: 20 }}
        >
          Start Pipeline
        </button>
      )}
    </div>
  );
}

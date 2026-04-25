import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const INSTITUTIONS = {
  'Memorial Sloan Kettering Cancer Center': '001',
  'McGill University Health Centre': '002',
};

export default function SetupWizard() {
  const { configure } = useApp();
  const [institution, setInstitution] = useState('');
  const [dicomFolder, setDicomFolder] = useState('');
  const [isNewDataset, setIsNewDataset] = useState(null);
  const [stsDataset, setStsDataset] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sarcomaai_last_config') || 'null');
      if (saved) {
        if (saved.institution) setInstitution(saved.institution);
        if (saved.dicomFolder) setDicomFolder(saved.dicomFolder);
        if (saved.isNewDataset !== undefined && saved.isNewDataset !== null) setIsNewDataset(saved.isNewDataset);
        if (saved.stsDataset) setStsDataset(saved.stsDataset);
      }
    } catch {}
  }, []);

  const valid = institution && dicomFolder && isNewDataset !== null && stsDataset;

  const handleSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      await configure({ institution: INSTITUTIONS[institution] || institution, dicomFolder, stsDataset, isNewDataset });
    } catch (e) {
      setError(e.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '2.5rem',
        width: '100%',
        maxWidth: 520,
      }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
            SarcomaAI
          </div>
          <div style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 14 }}>
            Configure your imaging dataset to get started
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Institution</label>
          <select
            value={institution}
            onChange={e => setInstitution(e.target.value)}
            style={selectStyle}
          >
            <option value="" disabled>-- Select Institution --</option>
            {Object.keys(INSTITUTIONS).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>DICOM Folder Path</label>
          <input
            type="text"
            value={dicomFolder}
            onChange={e => setDicomFolder(e.target.value)}
            placeholder="/path/to/Dataset/DICOM"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Folder containing PA-numbered subfolders
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Dataset Type</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => setIsNewDataset(true)}
              style={{
                ...toggleBase,
                ...(isNewDataset === true ? toggleActive : toggleInactive),
              }}
            >
              New Dataset
            </button>
            <button
              onClick={() => setIsNewDataset(false)}
              style={{
                ...toggleBase,
                ...(isNewDataset === false ? toggleActive : toggleInactive),
              }}
            >
              Existing Dataset
            </button>
          </div>
        </div>

        {isNewDataset !== null && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>
              {isNewDataset ? 'New STS Dataset Path' : 'Existing STS Dataset Path'}
            </label>
            <input
              type="text"
              value={stsDataset}
              onChange={e => setStsDataset(e.target.value)}
              placeholder={isNewDataset ? '/path/to/new/STS_Dataset' : '/path/to/existing/STS_Dataset'}
              style={inputStyle}
            />
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '0.6rem 0.75rem',
            color: 'var(--danger)',
            fontSize: 13,
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!valid || loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: 8,
            border: 'none',
            background: valid && !loading ? 'var(--accent)' : 'var(--bg-elevated)',
            color: valid && !loading ? '#fff' : 'var(--text-secondary)',
            fontSize: 15,
            fontWeight: 600,
            cursor: valid && !loading ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {loading && (
            <span style={{
              width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff', borderRadius: '50%',
              display: 'inline-block', animation: 'spin 0.7s linear infinite',
            }} />
          )}
          {loading ? 'Connecting...' : 'Confirm Setup'}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: var(--bg-elevated); }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  letterSpacing: '0.02em',
};

const inputStyle = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
};

const toggleBase = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const toggleActive = {
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
};

const toggleInactive = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
};

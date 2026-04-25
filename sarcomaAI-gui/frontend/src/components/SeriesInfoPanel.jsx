import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const T1_KEYWORDS = ['T1', 'VIBE', 'MPRAGE', 'FLASH', 'SPGR', 'GRE'];
const T2_KEYWORDS = ['T2', 'SPACE', 'HASTE', 'TSE', 'FSE', 'STIR', 'FLAIR', 'BLADE'];

function getSuggestion(description) {
  if (!description) return null;
  const upper = description.toUpperCase();
  if (T1_KEYWORDS.some(k => upper.includes(k))) return 't1';
  if (T2_KEYWORDS.some(k => upper.includes(k))) return 't2';
  return null;
}

export default function SeriesInfoPanel() {
  const {
    currentPatient, currentStudy, currentSeries,
    seriesMetadata, selections,
    selectModality, undoSelection, savedAt,
  } = useApp();

  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const key = currentPatient && currentStudy ? `${currentPatient}/${currentStudy}` : null;
  const sel = key ? (selections[key] || { t1: null, t2: null }) : { t1: null, t2: null };

  const suggestion = getSuggestion(seriesMetadata?.seriesDescription);
  const isT1 = sel.t1 === currentSeries;
  const isT2 = sel.t2 === currentSeries;

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>Series Info</span>
        {showSaved && (
          <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>
            Saved ✓
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {seriesMetadata ? (
          <>
            <Section title="Metadata">
              <MetaRow label="Description" value={seriesMetadata.seriesDescription || '—'} />
              <MetaRow label="Slices" value={seriesMetadata.sliceCount ?? '—'} />
              <MetaRow label="Slice Thickness" value={seriesMetadata.sliceThickness ? `${seriesMetadata.sliceThickness} mm` : '—'} />
              <MetaRow label="Date" value={seriesMetadata.acquisitionDate || '—'} />
              <MetaRow label="Modality" value={seriesMetadata.modality || '—'} />
            </Section>

            {suggestion && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Auto-Suggest
                </div>
                <div style={{
                  display: 'inline-block',
                  background: suggestion === 't1' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                  border: `1px solid ${suggestion === 't1' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`,
                  borderRadius: 6,
                  padding: '4px 12px',
                  color: suggestion === 't1' ? 'var(--t1)' : 'var(--t2)',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  Suggested: {suggestion.toUpperCase()}
                </div>
              </div>
            )}
          </>
        ) : currentSeries ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading metadata...</div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No series selected</div>
        )}

        <Section title="Current Assignment">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--t1)', fontSize: 11, fontWeight: 700, width: 20 }}>T1</span>
            <span style={{ fontSize: 12, color: sel.t1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {sel.t1 ? `${sel.t1} ✓` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--t2)', fontSize: 11, fontWeight: 700, width: 20 }}>T2</span>
            <span style={{ fontSize: 12, color: sel.t2 ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {sel.t2 ? `${sel.t2} ✓` : '—'}
            </span>
          </div>
        </Section>

        {currentSeries && (
          <Section title="Actions">
            <button
              onClick={() => selectModality('t1', currentSeries)}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 6,
                border: 'none',
                outline: `1px solid ${isT1 ? 'var(--t1)' : 'var(--border)'}`,
                background: isT1 ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)',
                color: isT1 ? 'var(--t1)' : 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 8,
                transition: 'all 0.15s',
              }}
            >
              {isT1 ? '✓ T1 Selected' : 'Mark as T1'}
            </button>
            <button
              onClick={() => selectModality('t2', currentSeries)}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 6,
                border: 'none',
                outline: `1px solid ${isT2 ? 'var(--t2)' : 'var(--border)'}`,
                background: isT2 ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                color: isT2 ? 'var(--t2)' : 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 12,
                transition: 'all 0.15s',
              }}
            >
              {isT2 ? '✓ T2 Selected' : 'Mark as T2'}
            </button>

            <button
              onClick={undoSelection}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                display: 'block',
              }}
            >
              Undo Selections
            </button>
          </Section>
        )}

        <div style={{
          marginTop: '1.5rem',
          padding: '0.6rem 0.75rem',
          background: 'var(--bg-elevated)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          lineHeight: 1.8,
        }}>
          Keys: 1=T1&nbsp;&nbsp;2=T2&nbsp;&nbsp;→=Next Series&nbsp;&nbsp;↓=Next Patient
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-secondary)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

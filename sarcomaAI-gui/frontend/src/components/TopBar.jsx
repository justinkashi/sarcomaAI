import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { totalStudies, completeStudies, allComplete, startPipeline, pipelineState } = useApp();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRun = () => {
    setShowConfirm(false);
    startPipeline();
  };

  return (
    <>
      <div style={{
        height: 52,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.25rem',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.3px' }}>
          SarcomaAI
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {allComplete && (
            <span style={{
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.4)',
              borderRadius: 20,
              padding: '2px 10px',
              color: 'var(--success)',
              fontSize: 12,
              fontWeight: 600,
            }}>
              All Complete
            </span>
          )}
          <span style={{ color: allComplete ? 'var(--success)' : 'var(--text-secondary)', fontSize: 13 }}>
            {completeStudies} / {totalStudies} studies complete
          </span>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!allComplete || pipelineState === 'running'}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: 6,
            border: 'none',
            background: allComplete && pipelineState !== 'running' ? 'var(--success)' : 'var(--bg-elevated)',
            color: allComplete && pipelineState !== 'running' ? '#fff' : 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: allComplete && pipelineState !== 'running' ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          {pipelineState === 'running' ? 'Running...' : 'Run Pipeline'}
        </button>
      </div>

      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '2rem', maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Run Pipeline?</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: '1.5rem' }}>
              This will start anonymization and NIfTI conversion for all selected series. This may take several minutes.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '0.45rem 1rem', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRun}
                style={{
                  padding: '0.45rem 1rem', borderRadius: 6, border: 'none',
                  background: 'var(--success)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                Start Pipeline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

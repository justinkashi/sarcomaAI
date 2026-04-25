import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

function statusColor(sel) {
  if (!sel || (!sel.t1 && !sel.t2)) return 'var(--danger)';
  if (sel.t1 && sel.t2) return 'var(--success)';
  return 'var(--warning)';
}

export default function PatientSidebar() {
  const {
    patientTree, selections, seriesList,
    currentPatient, currentStudy, currentSeries,
    navigateTo, selectSeries,
  } = useApp();

  const [expandedPatients, setExpandedPatients] = useState({});

  const patients = Object.keys(patientTree);

  const togglePatient = (pt) => {
    setExpandedPatients(prev => ({ ...prev, [pt]: !prev[pt] }));
  };

  const handleStudyClick = async (pt, st, ser) => {
    await navigateTo(pt, st, ser);
  };

  const handleSeriesClick = async (e, ser) => {
    e.stopPropagation();
    await selectSeries(ser);
  };

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
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
      }}>
        Patients ({patients.length})
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {patients.map(pt => {
          const studies = patientTree[pt] || [];
          const isExpanded = expandedPatients[pt] !== false && (expandedPatients[pt] || pt === currentPatient);
          const patSel = studies.map(st => selections[`${pt}/${st}`] || { t1: null, t2: null });
          const allDone = patSel.every(s => s.t1 && s.t2);
          const anyDone = patSel.some(s => s.t1 || s.t2);
          const dotColor = allDone ? 'var(--success)' : anyDone ? 'var(--warning)' : 'var(--danger)';

          return (
            <div key={pt}>
              <div
                onClick={() => togglePatient(pt)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.55rem 1rem',
                  cursor: 'pointer',
                  background: pt === currentPatient ? 'rgba(91,142,244,0.1)' : 'transparent',
                  borderLeft: pt === currentPatient ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.1s',
                  userSelect: 'none',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: dotColor, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: pt === currentPatient ? 600 : 400,
                  color: pt === currentPatient ? 'var(--text-primary)' : 'var(--text-secondary)',
                  flex: 1,
                }}>
                  {pt}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {isExpanded && studies.map(st => {
                const sel = selections[`${pt}/${st}`] || { t1: null, t2: null };
                const isCurrentStudy = pt === currentPatient && st === currentStudy;
                const currentSeriesForStudy = isCurrentStudy ? seriesList : [];

                return (
                  <div key={st}>
                    <div
                      onClick={() => handleStudyClick(pt, st, null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0.45rem 1rem 0.45rem 2rem',
                        cursor: 'pointer',
                        background: isCurrentStudy ? 'rgba(91,142,244,0.06)' : 'transparent',
                        transition: 'background 0.1s',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: statusColor(sel), flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 12,
                        fontWeight: isCurrentStudy ? 600 : 400,
                        color: isCurrentStudy ? 'var(--accent)' : 'var(--text-secondary)',
                        flex: 1,
                      }}>
                        {st}
                      </span>
                    </div>

                    {isCurrentStudy && currentSeriesForStudy.map(ser => {
                      const isT1 = sel.t1 === ser;
                      const isT2 = sel.t2 === ser;
                      const isActive = ser === currentSeries;

                      return (
                        <div
                          key={ser}
                          onClick={(e) => handleSeriesClick(e, ser)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '0.35rem 1rem 0.35rem 3rem',
                            cursor: 'pointer',
                            background: isActive ? 'rgba(91,142,244,0.15)' : 'transparent',
                            transition: 'background 0.1s',
                            userSelect: 'none',
                          }}
                        >
                          <span style={{
                            fontSize: 11,
                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            flex: 1,
                            fontFamily: 'monospace',
                          }}>
                            {ser}
                          </span>
                          {isT1 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              background: 'var(--t1)', color: '#fff',
                              borderRadius: 3, padding: '1px 4px',
                            }}>T1</span>
                          )}
                          {isT2 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              background: 'var(--t2)', color: '#fff',
                              borderRadius: 3, padding: '1px 4px',
                            }}>T2</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

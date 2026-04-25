import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import TopBar from './TopBar';
import PatientSidebar from './PatientSidebar';
import DicomViewer from './DicomViewer';
import SeriesInfoPanel from './SeriesInfoPanel';
import PipelineStatus from './PipelineStatus';

export default function MainLayout() {
  const {
    patientTree, currentPatient, currentStudy, currentSeries,
    seriesList, selections, navigateTo, selectSeries, selectModality,
  } = useApp();

  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(300);
  const draggingRef = useRef(null);
  const containerRef = useRef(null);

  const onMouseDown = (side) => (e) => {
    e.preventDefault();
    draggingRef.current = side;
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (draggingRef.current === 'left') {
        const newW = Math.max(160, Math.min(480, e.clientX - rect.left));
        setLeftWidth(newW);
      } else {
        const newW = Math.max(200, Math.min(480, rect.right - e.clientX));
        setRightWidth(newW);
      }
    };
    const onUp = () => { draggingRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleKeyDown = useCallback((e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === '1' && currentSeries) {
      selectModality('t1', currentSeries);
    } else if (e.key === '2' && currentSeries) {
      selectModality('t2', currentSeries);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!seriesList.length) return;
      const idx = seriesList.indexOf(currentSeries);
      const next = seriesList[idx + 1];
      if (next) selectSeries(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const patients = Object.keys(patientTree);
      const pidx = patients.indexOf(currentPatient);
      if (pidx < 0) return;
      const nextPt = patients[pidx + 1];
      if (nextPt) {
        const st = patientTree[nextPt][0];
        navigateTo(nextPt, st, null);
      }
    }
  }, [currentSeries, seriesList, patientTree, currentPatient, selectModality, selectSeries, navigateTo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const dragHandleStyle = {
    width: 4,
    flexShrink: 0,
    cursor: 'col-resize',
    background: 'var(--border)',
    transition: 'background 0.15s',
    zIndex: 5,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar />

      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ width: leftWidth, flexShrink: 0, overflow: 'hidden' }}>
          <PatientSidebar />
        </div>

        <div
          onMouseDown={onMouseDown('left')}
          style={dragHandleStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
        />

        <DicomViewer />

        <div
          onMouseDown={onMouseDown('right')}
          style={dragHandleStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
        />

        <div style={{ width: rightWidth, flexShrink: 0, overflow: 'hidden' }}>
          <SeriesInfoPanel />
        </div>
      </div>

      <PipelineStatus />
    </div>
  );
}

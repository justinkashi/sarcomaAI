import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';

const API = 'http://localhost:5050';
const ENGINE_ID = 'sarcomaEngine';
const VIEWPORT_ID = 'sarcomaViewport';
const TOOL_GROUP_ID = 'sarcomaGroup';

export default function DicomViewer() {
  const { currentPatient, currentStudy, currentSeries, fileCount, sliceIndex, setSliceIndex } = useApp();

  const divRef = useRef(null);
  const engineRef = useRef(null);
  const viewportRef = useRef(null);
  const mountedRef = useRef(true);
  const [viewportReady, setViewportReady] = useState(false);

  const initCs = useCallback(async () => {
    if (!divRef.current) return;
    try {
      const { RenderingEngine, Enums, getRenderingEngine } = await import('@cornerstonejs/core');
      const {
        ToolGroupManager, WindowLevelTool, ZoomTool, PanTool,
        StackScrollTool, Enums: ToolEnums,
      } = await import('@cornerstonejs/tools');

      try { getRenderingEngine(ENGINE_ID)?.destroy(); } catch {}

      const engine = new RenderingEngine(ENGINE_ID);
      engineRef.current = engine;

      engine.setViewports([{
        viewportId: VIEWPORT_ID,
        type: Enums.ViewportType.STACK,
        element: divRef.current,
        defaultOptions: { background: [0, 0, 0] },
      }]);

      viewportRef.current = engine.getViewport(VIEWPORT_ID);

      try { ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID); } catch {}
      const tg = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
      tg.addTool(WindowLevelTool.toolName);
      tg.addTool(ZoomTool.toolName);
      tg.addTool(PanTool.toolName);
      tg.addTool(StackScrollTool.toolName);
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }] });
      tg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }] });
      tg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }] });
      tg.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }] });
      tg.addViewport(VIEWPORT_ID, ENGINE_ID);

      const handleNewImage = (e) => {
        if (!mountedRef.current) return;
        const idx = e.detail?.imageIdIndex ?? e.detail?.newImageIdIndex ?? 0;
        setSliceIndex(idx);
      };
      divRef.current.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleNewImage);

      if (mountedRef.current) setViewportReady(true);
    } catch (err) {
      console.error('Cornerstone init error:', err);
    }
  }, [setSliceIndex]);

  useEffect(() => {
    mountedRef.current = true;
    setViewportReady(false);
    initCs();
    return () => {
      mountedRef.current = false;
      try { engineRef.current?.destroy(); engineRef.current = null; } catch {}
    };
  }, [initCs]);

  // Load stack — only runs when viewport is ready AND series/fileCount are set
  useEffect(() => {
    if (!viewportReady || !viewportRef.current) return;
    if (!currentPatient || !currentStudy || !currentSeries || fileCount === 0) return;

    const imageIds = Array.from({ length: fileCount }, (_, i) =>
      `wadouri:${API}/api/dicom-file?patient=${encodeURIComponent(currentPatient + '/' + currentStudy)}&series=${encodeURIComponent(currentSeries)}&index=${i}`
    );

    viewportRef.current.setStack(imageIds, 0)
      .then(() => viewportRef.current?.render())
      .catch(err => console.error('setStack error:', err));
  }, [viewportReady, currentPatient, currentStudy, currentSeries, fileCount]);

  const hasContent = currentPatient && currentStudy && currentSeries;

  return (
    <div style={{ flex: 1, background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* Always rendered so Cornerstone gets real dimensions on init */}
      <div ref={divRef} style={{ width: '100%', height: '100%' }} />

      {/* Placeholder overlay — sits on top until a series is selected */}
      {!hasContent && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', pointerEvents: 'none' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◫</div>
            Select a series from the sidebar
          </div>
        </div>
      )}

      {hasContent && (
        <>
          <div style={{ position: 'absolute', top: 10, left: 12, color: 'rgba(255,255,255,0.3)', fontSize: 11, pointerEvents: 'none', fontFamily: 'monospace' }}>
            LDrag:W/L · RDrag:Zoom · MDrag:Pan · Scroll:Slice
          </div>
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '3px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none' }}>
            {sliceIndex + 1} / {fileCount}
          </div>
        </>
      )}
    </div>
  );
}

# SarcomaAI GUI — System Design Document

Comparing the original implementation (Jonathan's version) against the current redesigned version.

---

## Part 1 — Original System (sarcomagui_original)

### Overview

A minimal functional prototype built to prove out the DICOM selection workflow. The entire frontend was a single React component. The backend had hardcoded paths pointing to Jonathan's local machine. There was no visual design system, no real pipeline integration, and no way to run it on any machine other than the original developer's.

---

### Architecture

```
Browser (React, port 3000)
        │  HTTP fetch (hardcoded localhost:5050)
        ▼
Flask API (port 5050)
        │  reads filesystem directly
        ▼
Local DICOM folder (hardcoded path)
```

No pipeline integration — the "Start Pipeline" button existed in the UI but only called `console.log`.

---

### Backend — `App.py`

**6 routes, all reading from a hardcoded path:**

```python
DATA_ROOT = "/Users/jonathan/Documents/RI-MUHC/SarcomaAI/Pipeline/Dataset-scrubbed/DICOM"
SELECTION_FILE = "selections.csv"  # relative — saved in whatever directory the server was started from
```

| Route | Method | Purpose |
|---|---|---|
| `/api/patients` | GET | Walks DATA_ROOT, finds PA/ST paths containing valid DICOMs |
| `/api/series` | GET | Lists SE folders under a patient/study path |
| `/api/slice` | GET | Reads one DICOM file, converts pixel data to PNG via `matplotlib.pyplot.imsave`, returns image bytes |
| `/api/max-slice` | GET | Returns count of valid DICOM files in a series |
| `/api/save-selection` | POST | Appends T1/T2 selection to `selections.csv` |
| `/api/get-selection` | GET | Reads back saved T1/T2 for a patient/study |

**Image serving approach:** each slice request reads the raw DICOM pixel array with pydicom, converts it to a grayscale PNG in memory using matplotlib, and streams the PNG bytes. No windowing, no zoom, no real DICOM rendering.

**No dynamic configuration.** `DATA_ROOT` was a hardcoded string — the app could only run on Jonathan's machine without manually editing the source code.

**No pipeline connection.** `pipeline.py` existed in `python_pipeline/` but was never called by the backend.

---

### Frontend — Single component (`T1T2Selector.jsx`)

The entire application UI — setup, patient navigation, series browsing, slice viewing, and selection — lived in one ~320-line React component. No component decomposition, no state management library, no context.

**Setup wizard (inline):**
- Institution dropdown
- Folder picker using `<input type="file" webkitdirectory>` — extracted only the top-level folder name, not the full path (browser security limitation)
- New/existing dataset toggle
- Save location picker (same limitation)
- `setupComplete` was a computed boolean — no backend call was made at setup time

**DICOM viewer:**
- On setup completion, fetched `/api/patients` and built a flat `patientToStudies` map
- Patient/study navigation via dropdowns + Previous/Next buttons
- Series list displayed as a column of plain `<button>` elements
- Slice viewer: `<img>` tag pointed at `/api/slice?...` URL, reloaded on every slice index change
- Slice navigation: range `<input type="range">` slider + arrow key listeners
- Image size: fixed 300×300px box

**T1/T2 selection:**
- Two buttons: "Select as T1" / "Select as T2" (toggle behavior)
- POSTed immediately to `/api/save-selection`
- T1 badge shown as absolute-positioned red div on the series button
- T2 badge shown as blue div

**"Start Pipeline" button:**
```javascript
const handleStartPipeline = () => {
    const args = [institutions[inputInstitution], inputDatasetPath, ...];
    console.log('Starting pipeline with args:', args);
};
```
Never connected to the backend.

**State — all local to the component:**
```javascript
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
```

No global state, no context, no persistence across navigation.

---

### Python Pipeline — `python_pipeline/`

**Fully implemented and well-written. The pipeline itself was not the problem.**

```
config.py           — hardcoded Windows paths (Josh's OneDrive)
pipeline.py         — orchestration: copy → anonymize → normalize → NIfTI → ledger
series_select.py    — reads selection.csv, copies DICOM series, assigns PA###### IDs
ledger.py           — crash-tolerant row-by-row CSV append
dicom/
  dicom_anonymize.py  — scrubs 36 sensitive DICOM tags in-place
  dicom_tags.py       — extracts MRN, injects sts.INST.ID.modality traceability name
  dicom_copy.py       — atomic file copy
  dicom_utils.py      — checks series completeness
imaging/
  imaging_normalize.py — N4 bias field correction + Z-score normalization (SimpleITK + pyCERR)
  imaging_io.py        — atomic NIfTI write
anonymization_fields/
  sensitive_fields.json — 36 DICOM keywords to scrub
```

**Pipeline data flow:**
```
selections.csv
    → series_select.py  → copies DICOM, assigns PA######
    → dicom_tags.py     → extracts MRN, injects STS name into tag (0012,0040)
    → dicom_anonymize.py → scrubs 36 sensitive fields in-place
    → imaging_normalize.py → N4 bias correction → percentile clip → Z-score
    → imaging_io.py     → writes .nii file atomically
    → ledger.py         → appends one row to ledger.csv
```

**`config.py` — hardcoded, unmovable:**
```python
DATASET_PATH = Path(r"C:/Users/josho/OneDrive - McGill University/...")
STS_DATASET  = Path(r"C:/Users/josho/OneDrive - McGill University/...")
SELECTION_CSV = Path(r"C:/Users/josho/OneDrive - McGill University/.../selection.csv")
```

---

### What didn't work in the original

| Problem | Impact |
|---|---|
| `DATA_ROOT` hardcoded to Jonathan's path | App unusable on any other machine |
| `config.py` paths point to Josh's Windows OneDrive | Pipeline cannot run on any other machine |
| Folder picker only captures folder name, not path | Setup wizard collected useless information |
| "Start Pipeline" is `console.log` | No pipeline integration at all |
| `selections.csv` saved in server's working directory | Path unpredictable, may conflict between runs |
| No DICOM rendering — matplotlib PNG | No windowing, no zoom, no pan — just a grey image |
| All state in one component | No scalability, hard to debug |
| No visual design | White background, unstyled HTML buttons |

---

---

## Part 2 — Current System (sarcomaAI-gui, redesigned)

### Overview

A production-grade medical imaging workstation UI built around Cornerstone3D for proper DICOM rendering, a three-panel resizable layout, full pipeline integration with live streaming output, and a dynamic configuration system that works on any machine.

---

### Architecture

```
Browser (React + Cornerstone3D, port 3000)
        │
        │  /api/setup          → sets DATA_ROOT dynamically
        │  /api/patients        → patient tree
        │  /api/series          → series list
        │  /api/dicom-file      → raw DICOM bytes (for Cornerstone)
        │  /api/series-metadata → SeriesDescription, thickness, date, modality
        │  /api/save-selection  → persist T1/T2 to CSV
        │  /api/get-selection   → restore session
        │  /api/run-pipeline-stream → SSE stream of pipeline stdout
        ▼
Flask API (port 5050)
        │
        │  writes runtime_config.json
        │  spawns pipeline.py subprocess
        ▼
python_pipeline/pipeline.py
        │
        ▼
Filesystem (DICOM source, STS output dataset, ledger.csv)
```

---

### Backend — `App.py` (extended)

**11 routes. DATA_ROOT is now dynamic, set at runtime via `/api/setup`.**

```python
DATA_ROOT = None       # set by /api/setup
SELECTION_FILE = None  # set to DATA_ROOT/selections.csv
```

| Route | Method | Purpose |
|---|---|---|
| `/api/setup` | POST | Receives wizard config, validates paths, writes `runtime_config.json`, sets DATA_ROOT |
| `/api/patients` | GET | Same as original (requires setup first) |
| `/api/series` | GET | Same as original |
| `/api/slice` | GET | Kept for compatibility (matplotlib PNG fallback) |
| `/api/max-slice` | GET | Returns DICOM file count in series |
| `/api/dicom-file` | GET | Serves raw DICOM bytes with `mimetype=application/dicom` for Cornerstone |
| `/api/series-metadata` | GET | Returns SeriesDescription, sliceCount, sliceThickness, acquisitionDate, modality |
| `/api/save-selection` | POST | Same as original, now saves to DATA_ROOT/selections.csv |
| `/api/get-selection` | GET | Same as original |
| `/api/run-pipeline` | POST | Runs pipeline synchronously, returns full stdout/stderr |
| `/api/run-pipeline-stream` | GET | SSE stream — spawns pipeline subprocess, yields each stdout line as a `data:` event |

**Shared helper (refactored):**
```python
def _get_valid_dicom_files(series_path):
    # returns sorted list of valid DICOM filenames
    # used by /api/slice, /api/max-slice, /api/dicom-file, /api/series-metadata
```

**`/api/setup` pipeline:**
1. Validates `dicomFolder` exists on disk
2. Sets module-level `DATA_ROOT = dicomFolder`
3. Sets `SELECTION_FILE = dicomFolder/selections.csv`
4. Computes `dataset_path = Path(dicomFolder).parent` (pipeline expects parent of DICOM/)
5. Writes `python_pipeline/runtime_config.json`

**Pipeline streaming via SSE:**
```python
@app.route('/api/run-pipeline-stream')
def run_pipeline_stream():
    def generate():
        process = subprocess.Popen([sys.executable, pipeline_script], ...)
        for line in process.stdout:
            yield f"data: {json.dumps({'line': line.rstrip()})}\n\n"
        process.wait()
        yield f"data: {json.dumps({'done': True, 'returncode': process.returncode})}\n\n"
    return Response(generate(), mimetype='text/event-stream')
```

---

### Python Pipeline — `python_pipeline/`

**Unchanged in logic, but `config.py` is now dynamic:**

```python
# config.py — reads runtime_config.json written by Flask at setup time
_cfg = json.loads(Path(__file__).parent / "runtime_config.json").read_text())

INSTITUTION   = _cfg.get("institution", "002")
DATASET_PATH  = Path(_cfg["dataset_path"])
STS_DATASET   = Path(_cfg["sts_dataset"])
SELECTION_CSV = Path(_cfg["selection_csv"])
IS_NEW_DATASET = _cfg.get("is_new_dataset", True)
```

No more hardcoded paths. Works on any machine after a setup call.

---

### Frontend — Component Architecture

Decomposed from one 320-line component into 8 focused components sharing state through React Context.

```
App.js
  └─ AppProvider (AppContext.js)
       ├─ SetupWizard.jsx        (shown when !isConfigured)
       └─ MainLayout.jsx         (shown when isConfigured)
            ├─ TopBar.jsx
            ├─ PatientSidebar.jsx
            ├─ DicomViewer.jsx
            ├─ SeriesInfoPanel.jsx
            └─ PipelineStatus.jsx
```

---

### State Management — `AppContext.js`

All shared state lives in a single React Context. Components read and dispatch through the context — no prop drilling.

**State:**
```javascript
isConfigured        // bool — wizard completed
config              // { institution, dicomFolder, stsDataset, isNewDataset }
patientTree         // { PA000001: ['ST000001', 'ST000002'], ... }
selections          // { 'PA000001/ST000001': { t1: 'SE000003', t2: 'SE000005' } }
currentPatient      // 'PA000001'
currentStudy        // 'ST000001'
currentSeries       // 'SE000003'
seriesList          // ['SE000001', 'SE000002', 'SE000003']
fileCount           // 128 (DICOM files in current series)
sliceIndex          // 42
seriesMetadata      // { seriesDescription, sliceCount, sliceThickness, ... }
pipelineState       // 'idle' | 'running' | 'done' | 'error'
pipelineLog         // [{ text, type: 'info'|'error'|'success' }]
savedAt             // timestamp (drives "Saved ✓" flash in SeriesInfoPanel)
```

**Computed:**
```javascript
totalStudies    // sum of all studies across all patients
completeStudies // studies where both t1 AND t2 are set
allComplete     // totalStudies > 0 && completeStudies === totalStudies
```

**Actions:**
- `configure(cfg)` — POSTs to /api/setup, saves to localStorage, calls loadPatients
- `loadPatients()` — builds patientTree, restores all selections, navigates to first incomplete
- `navigateTo(patient, study, series)` — updates navigation, fetches seriesList + metadata
- `selectSeries(series)` — updates currentSeries, fetches fileCount + metadata
- `selectModality(type, series)` — sets t1/t2, POSTs to backend, auto-advances if both set
- `undoSelection()` — clears t1+t2 for current patient/study
- `startPipeline()` — opens EventSource on `/api/run-pipeline-stream`, streams log lines into pipelineLog

---

### DICOM Viewer — Cornerstone3D

Replaces the matplotlib PNG approach entirely.

**Initialization (`initCornerstone.js`):**
```javascript
await csInit();                              // Cornerstone core
dicomImageLoaderInit({ maxWebWorkers: 0 }); // DICOM loader (no web workers)
await csToolsInit();                         // Tools engine
addTool(WindowLevelTool);                    // Must register globally before tool groups use them
addTool(ZoomTool);
addTool(PanTool);
addTool(StackScrollTool);
```

**Viewport setup (`DicomViewer.jsx`):**
```javascript
engine.setViewports([{
    viewportId: 'sarcomaViewport',
    type: Enums.ViewportType.STACK,  // 2D stack — one slice at a time
    element: divRef.current,
    defaultOptions: { background: [0, 0, 0] },
}]);
```

**Image loading:**
```javascript
// imageIds built from the file count returned by /api/max-slice
const imageIds = Array.from({ length: fileCount }, (_, i) =>
    `wadouri:http://localhost:5050/api/dicom-file?patient=${encodeURIComponent(...)}&series=...&index=${i}`
);
await viewport.setStack(imageIds, 0);
viewport.render();
```

Cornerstone fetches each DICOM file via XHR, decodes it natively in the browser, and renders it to a WebGL canvas. This gives proper 12-bit DICOM rendering, not an 8-bit PNG approximation.

**Tools active:**
| Tool | Binding |
|---|---|
| WindowLevelTool | Left mouse drag |
| ZoomTool | Right mouse drag |
| PanTool | Middle mouse drag |
| StackScrollTool | Mouse wheel |

**Race condition handling:** `viewportReady` state flag is set only after async init completes. The stack-loading effect depends on both `viewportReady` and `currentSeries` — ensuring neither fires before the other is ready.

---

### UI Layout

**Dark theme** — CSS custom properties defined in `index.css`:
```css
--bg-base: #111114      /* page background */
--bg-surface: #1c1c21   /* panels */
--bg-elevated: #26262e  /* inputs, cards */
--accent: #5b8ef4       /* blue — active/selected */
--success: #22c55e      /* green — complete */
--warning: #f59e0b      /* yellow — partial */
--danger: #ef4444       /* red — untouched / error */
--t1: #ef4444           /* T1 label color */
--t2: #3b82f6           /* T2 label color */
```

**Three-panel layout (MainLayout.jsx):**
```
┌─────────────────────────────────────────────────────┐
│  TopBar: SarcomaAI | 8/12 studies complete | Run    │
├──────────────┬────────────────────┬─────────────────┤
│ PatientSide- │                    │  SeriesInfo-    │
│ bar (280px   │   DicomViewer      │  Panel (300px   │
│ default,     │   (flex-grow,      │  default,       │
│ draggable)   │   Cornerstone3D)   │  draggable)     │
└──────────────┴────────────────────┴─────────────────┘
                        ▲
              PipelineStatus slides up from bottom
```

Panels are resizable by dragging the 4px dividers between them. Min/max widths enforced.

---

### Component Responsibilities

**`SetupWizard.jsx`**
- Text inputs for full absolute paths (not file pickers — browser security prevents reading absolute paths from file picker)
- localStorage pre-fill on load (`sarcomaai_last_config`)
- Calls `configure()` on submit — shows spinner, displays inline error if backend rejects

**`TopBar.jsx`**
- Shows "X / Y studies complete" live counter
- "Run Pipeline" button: disabled until `allComplete`, triggers confirmation modal before calling `startPipeline()`

**`PatientSidebar.jsx`**
- Expandable tree: patient → study → series (click to expand/collapse)
- Status dot per patient: red = nothing selected, yellow = one of T1/T2, green = both
- T1/T2 badges on individual series entries
- Clicking a series calls `navigateTo` + `selectSeries`

**`DicomViewer.jsx`**
- Cornerstone3D STACK viewport
- Overlays: controls hint (top-left), slice counter (bottom-center)
- Placeholder shown when no series selected

**`SeriesInfoPanel.jsx`**
- Metadata rows: Description, Slices, Slice Thickness, Date, Modality
- Auto-suggest: reads SeriesDescription, checks against T1/T2 keyword lists
  - T1 keywords: T1, VIBE, MPRAGE, FLASH, SPGR, GRE
  - T2 keywords: T2, SPACE, HASTE, TSE, FSE, STIR, FLAIR, BLADE
- Current assignment display with T1/T2 in their respective colors
- "Mark as T1" / "Mark as T2" buttons (toggle — selected state shown)
- "Undo Selections" link
- "Saved ✓" flash (2 seconds) after each selection persists
- Keyboard hint: `1=T1  2=T2  →=Next Series  ↓=Next Patient`

**`PipelineStatus.jsx`**
- Fixed-bottom slide-up panel (40vh), only visible when `pipelineState !== 'idle'`
- Spinner while running, ✓ or ✗ when done
- Scrollable monospace log — lines colored info/error/success
- Close button (only when not running)
- Auto-scrolls to latest log line

**Keyboard shortcuts (registered in `MainLayout.jsx`):**
| Key | Action |
|---|---|
| `1` | Mark current series as T1 |
| `2` | Mark current series as T2 |
| `→` | Next series in current study |
| `↓` | Next patient |

---

### Session Persistence

Selections are saved to `{dicomFolder}/selections.csv` on every mark action. On app reload, `loadPatients()` re-fetches all selections from the backend and restores complete navigation state — including navigating directly to the first incomplete patient. Doctors can close the app mid-session and resume exactly where they left off.

Config (paths, institution) is saved in `localStorage` under key `sarcomaai_last_config` and pre-fills the wizard on next open.

---

## Comparison Summary

| Aspect | Original | Current |
|---|---|---|
| **Machine portability** | Jonathan's machine only | Any machine — paths set at runtime |
| **DICOM rendering** | matplotlib → 8-bit PNG | Cornerstone3D → native WebGL, real DICOM |
| **Windowing (W/L)** | None | Left drag |
| **Zoom/Pan** | None | Right drag / Middle drag |
| **Slice scroll** | Slider + arrow keys | Mouse wheel (Cornerstone native) |
| **UI layout** | Single scrolling page | 3-panel dark theme, resizable |
| **Patient navigation** | Dropdown + prev/next buttons | Expandable sidebar tree |
| **Status visibility** | None | Red/yellow/green dots per patient |
| **Series metadata** | None | SeriesDescription, thickness, date, modality |
| **T1/T2 auto-suggest** | None | Keyword matching on SeriesDescription |
| **Pipeline integration** | `console.log` stub | Full SSE streaming with live log |
| **Frontend state** | All in one component | React Context across 8 components |
| **Backend config** | Hardcoded string | Dynamic via /api/setup + runtime JSON |
| **Session restore** | None | CSV + localStorage |
| **CSS/Design** | Unstyled HTML | Dark medical imaging theme with CSS variables |
| **npm scripts** | react-scripts | craco (webpack overrides for Cornerstone) |
| **Dependencies** | react, pydicom, matplotlib | + cornerstonejs, dicom-image-loader, craco |

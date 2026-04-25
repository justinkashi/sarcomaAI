# SarcomaAI GUI

A medical imaging workstation for selecting T1/T2 MRI series from DICOM datasets and running the SarcomaAI anonymization + NIfTI conversion pipeline. Built with React + Cornerstone3D (frontend) and Flask (backend).

---

## Prerequisites

You need three things installed before starting:

### 1. Python 3.11+
```bash
python3 --version
```
If not installed: https://www.python.org/downloads/

### 2. Node.js + npm
```bash
node --version
npm --version
```
If not installed:
```bash
brew install node
```
Or download from https://nodejs.org

### 3. A Python virtual environment with dependencies

Create a venv and install required packages:
```bash
cd sarcomaAI-gui
python3 -m venv venv
source venv/bin/activate
pip install flask flask-cors pydicom matplotlib SimpleITK
pip install "pyCERR[napari] @ git+https://github.com/cerr/pyCERR"
```

> `pyCERR` is large and takes 5–10 minutes. It's required for N4 bias correction and NIfTI output. Without it the pipeline still runs but skips normalization and NIfTI export.

---

## Running the App

You need **two terminals open at the same time** — one for the backend, one for the frontend.

### Terminal 1 — Backend

```bash
cd sarcomaAI-gui/backend
source ../venv/bin/activate      # activate your venv
python App.py
```

You should see:
```
* Running on http://0.0.0.0:5050
* Debug mode: on
```

### Terminal 2 — Frontend

```bash
cd sarcomaAI-gui/frontend
npm install        # first time only — downloads dependencies (~2 min)
npm start
```

The browser opens automatically at `http://localhost:3000`.

> Both processes must stay running. If you close either terminal the app stops working.

---

## Using the App

### Step 1 — Setup Wizard

The first screen asks for four things:

| Field | What to enter |
|---|---|
| **Institution** | Select your site from the dropdown |
| **DICOM Folder Path** | Full absolute path to the folder containing your PA-numbered patient subfolders |
| **Dataset type** | New dataset (first time) or Existing dataset (adding more patients) |
| **STS Dataset Path** | Full absolute path to where the processed output should go |

**What the DICOM folder should look like:**
```
/your/path/DICOM/
    PA000001/
        ST000001/
            SE000001/   ← individual DICOM files live here
            SE000002/
    PA000002/
        ...
```

The path you enter should point to the `DICOM/` folder itself (the one containing PA-numbered subfolders).

Click **Confirm Setup**. The backend validates that both paths exist on disk before proceeding. If you see a red error, check that the paths are correct and the folder exists.

> Your paths are saved in the browser (localStorage) so the wizard pre-fills them on your next visit.

---

### Step 2 — Select T1 and T2 for Each Patient

The main screen has three panels:

**Left — Patient Sidebar**
- Lists all patients found in your DICOM folder
- Status dots: 🔴 = nothing selected, 🟡 = only T1 or T2, 🟢 = both done
- Click a patient to expand their studies and series
- Click a series to load it in the viewer

**Center — DICOM Viewer**
- Displays the selected series using Cornerstone3D (native DICOM rendering)
- **Left drag** — adjust Window/Level (brightness/contrast)
- **Right drag** — zoom
- **Middle drag** — pan
- **Scroll wheel** — move through slices

**Right — Series Info**
- Shows metadata: series description, slice count, thickness, date, modality
- **Auto-suggest**: if the series description contains keywords like `T1`, `VIBE`, `T2`, `SPACE` etc., a suggestion badge appears
- Shows current T1/T2 assignment for this patient
- **Mark as T1** / **Mark as T2** buttons to tag the current series

**Keyboard shortcuts:**
| Key | Action |
|---|---|
| `1` | Mark current series as T1 |
| `2` | Mark current series as T2 |
| `→` | Next series |
| `↓` | Next patient |

Selections save automatically after each click — a **Saved ✓** indicator flashes in the top-right of the Series Info panel. You can close the app and resume later without losing progress.

Once you mark both T1 and T2 for a patient, the app automatically advances to the next incomplete patient.

---

### Step 3 — Run the Pipeline

When all patients have both T1 and T2 selected, the **Run Pipeline** button in the top bar turns green.

Click it → confirm the prompt → the pipeline runs and a log panel slides up from the bottom showing live output.

**What the pipeline does:**
1. Copies selected DICOM series into the STS dataset folder with anonymized IDs (`PA######`)
2. Extracts the MRN and injects a traceability name (`sts.INSTITUTION.######.t1/t2`) into the DICOM header
3. Strips all 36 sensitive DICOM tags (patient name, dates, institution, etc.)
4. Runs N4 bias field correction and Z-score normalization
5. Exports a `.nii` NIfTI file per series
6. Appends a row to `ledger.csv`

**Output folder structure:**
```
STS_Dataset/
    DICOM/
        PA000001/ST000001/SE000003/    ← anonymized DICOM files
    sts.002/
        sts.002.000001/
            sts.002.000001.t1.nii      ← normalized NIfTI
            sts.002.000001.t2.nii
    ledger.csv                         ← links PA###### → real MRN
```

> `ledger.csv` is the only file linking anonymized IDs back to real patient MRNs. Keep it secure and off shared drives.

---

## Stopping

`Ctrl+C` in each terminal.

---

## Troubleshooting

**"Confirm Setup" gives an error**
- Check that the DICOM folder path exists and contains PA-numbered subfolders
- Check that the STS dataset path exists (create the folder first if needed)
- Make sure the backend terminal is running

**No patients appear after setup**
- The DICOM folder must contain subfolders named like `PA000001/ST000001/SE000001/`
- Each SE folder must contain valid DICOM files (not `.dcm` extension required, but must be DICOM format)

**Viewer shows black / no image**
- Click a series in the left sidebar first — the viewer only loads when a series is selected
- If the image still doesn't appear, check the browser console (F12) for errors

**Pipeline fails or produces no NIfTI files**
- Make sure `SimpleITK` and `pyCERR` are installed in your venv
- Check the log panel for the specific error — it shows full pipeline output

**Backend crashes on startup**
- Make sure your venv is activated (`source venv/bin/activate`)
- Make sure all packages are installed (`pip install flask flask-cors pydicom matplotlib`)

**`npm start` fails**
- Run `npm install` first inside the `frontend/` folder
- Make sure Node.js is installed (`node --version`)

---

## Notes for Developers

- The backend must be restarted if it crashes — path config is held in memory, not persisted to disk between restarts. Re-running the setup wizard after restart restores it.
- `selections.csv` is saved inside your DICOM folder and persists across restarts.
- The `python_pipeline/runtime_config.json` file is written by the backend at setup time and read by the pipeline at run time. Do not edit it manually.
- Docker support is planned (Jonathan) — this will replace the two-terminal startup with a single double-click launcher.

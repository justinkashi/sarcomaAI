# SarcomaAI GUI

A web-based tool for selecting T1/T2 MRI series from DICOM datasets, then running anonymization and NIfTI conversion as part of the SarcomaAI 2.0 data pipeline.

---

## 1. Usage

### What you need

- Python venv with Flask installed (the project uses `mmnn2` at `/Users/bustin/sarcomaAI/mmnn2`)
- Node.js + npm for the React frontend
- A DICOM dataset folder structured as `DICOM/PA######/ST######/SE######/`

### Running locally

Everything runs on your own machine. There is no remote server — the "website" is a React dev server on `localhost:3000` talking to a Flask API on `localhost:5050`.

**Step 1 — Start the backend**

```bash
source /Users/bustin/sarcomaAI/mmnn2/bin/activate
cd sarcomaAI-gui/backend
python App.py
# Flask starts at http://localhost:5050
```

**Step 2 — Start the frontend** (in a second terminal)

```bash
cd sarcomaAI-gui/frontend
npm install      # first time only
npm start
# React dev server opens http://localhost:3000 in your browser automatically
```

Both processes must be running at the same time.

### Using the app

**Setup wizard (first screen)**

Fill in all four fields before continuing:

| Field | What to enter |
|---|---|
| Institution | Select your site from the dropdown |
| DICOM folder | Full absolute path to the folder containing PA-numbered subfolders, e.g. `/data/Dataset/DICOM` |
| New or existing dataset | Choose whether this is a fresh SarcomaAI dataset or adding to one that already exists |
| SarcomaAI dataset path | Full absolute path to where the processed output should go (new), or where it already lives (existing) |

Click **Confirm Setup** — the backend validates both paths exist before proceeding.

**Series selection (main screen)**

- Use the patient and study dropdowns to navigate
- Click a series button on the left to load its slices in the viewer
- Scrub through slices with the slider or arrow keys (← →)
- Click **Select as T1** or **Select as T2** to tag the current series
- T1 tags appear as a red badge, T2 as blue
- Selections are saved to `selections.csv` inside your DICOM folder as you go — you can close and reopen the app without losing progress

**Running the pipeline**

Once every patient/study has both a T1 and T2 selected, a green **Start Pipeline** button appears in the bottom-right corner. Clicking it:

1. Copies the selected DICOM series into the SarcomaAI dataset folder with anonymized patient IDs (`PA######`)
2. Strips all 36 sensitive DICOM tags (dates, names, IDs) and replaces them with placeholders
3. Injects a traceability ID (`sts.INSTITUTION.######.t1/t2`) into the Clinical Trial Subject ID tag
4. Runs N4 bias field correction and Z-score normalization
5. Exports a `.nii` NIfTI file per series
6. Appends a row to `ledger.csv` linking the anonymized ID back to institution/MRN

A status panel appears at the bottom showing pipeline logs. Green = success, red = something failed (stderr is shown).

### Stopping

`Ctrl+C` in each terminal window stops the backend and frontend.

---

## 2. Design

### Architecture overview

```
Browser (localhost:3000)
        |
        |  HTTP (fetch)
        v
Flask API (localhost:5050)          ← App.py
        |
        |  subprocess.run()
        v
Python Pipeline (python_pipeline/)  ← pipeline.py
        |
        |  reads/writes
        v
Filesystem (DICOM folder, STS dataset folder, ledger.csv)
```

Everything is local. The browser never touches the filesystem directly — it talks to Flask, which talks to the filesystem and the pipeline.

### Component map

```
sarcomaAI-gui/
├── backend/
│   └── App.py                  Flask API — all routes live here
│
├── frontend/
│   └── src/
│       └── components/
│           └── T1T2Selector.jsx   Entire UI — wizard + viewer + pipeline trigger
│
└── python_pipeline/
    ├── config.py               Reads runtime_config.json (written by /api/setup)
    ├── pipeline.py             Orchestrates the full processing run
    ├── series_select.py        Copies selected DICOM series, assigns PA###### IDs
    ├── ledger.py               Crash-tolerant row-by-row ledger append
    ├── dicom/
    │   ├── dicom_anonymize.py  Scrubs sensitive tags using sensitive_fields.json
    │   ├── dicom_tags.py       Extracts MRN, injects STS traceability name
    │   └── dicom_copy.py       Atomic file copy
    └── imaging/
        ├── imaging_normalize.py  N4 bias correction + Z-score via SimpleITK/pyCERR
        └── imaging_io.py         Atomic NIfTI write
```

### How the wizard wires to the pipeline

The browser cannot read absolute file paths from the filesystem for security reasons — native file pickers only give you the file name, not the full path. That is why the wizard uses plain text inputs where you type the path yourself.

When you click **Confirm Setup**, the frontend POSTs to `/api/setup`:

```json
{
  "institution": "002",
  "dicomFolder": "/data/Dataset/DICOM",
  "stsDataset":  "/data/STS_Dataset",
  "isNewDataset": true
}
```

The backend validates the paths, then writes `python_pipeline/runtime_config.json`:

```json
{
  "institution":   "002",
  "dataset_path":  "/data/Dataset",
  "sts_dataset":   "/data/STS_Dataset",
  "selection_csv": "/data/Dataset/DICOM/selections.csv",
  "is_new_dataset": true
}
```

Note: `dataset_path` is the **parent** of the DICOM folder because the pipeline expects `dataset_path/DICOM/PA.../`. The frontend asks for the DICOM folder and the backend computes the parent automatically.

`config.py` reads this JSON at import time, so the pipeline always picks up the correct paths without any hardcoding.

### How series selections are saved

Every time you click Select as T1/T2, the frontend POSTs to `/api/save-selection`. The backend writes to `selections.csv` inside the DICOM folder:

```
Patient,Type,Study,Series
PA000001,T1,ST000001,SE000003
PA000001,T2,ST000001,SE000005
```

When the pipeline runs, `series_select.py` reads this CSV and uses it to decide what to copy and process.

### Pipeline data flow

```
selections.csv
      |
series_select.py  →  copies DICOM to STS_Dataset/DICOM/PA######/
      |
dicom_tags.py     →  reads MRN, injects sts.002.######.t1 into tag (0012,0040)
      |
dicom_anonymize.py →  scrubs 36 sensitive fields in-place
      |
imaging_normalize.py → N4 bias correction → percentile clip → Z-score
      |
imaging_io.py     →  writes sts.002/sts.002.######.t1.nii  (atomic)
      |
ledger.py         →  appends one row to ledger.csv (crash-tolerant)
```

The ledger schema:

```
Institution | MRN | Patient | Study | Series | Modality | MMNN Reference
```

This is the only file that links an anonymized `PA######` back to a real patient MRN. Keep it secure and off any shared drives.

### Can you test with a live/hosted server?

Right now, no — the app is designed for local use only. The Flask server and the DICOM files must be on the same machine because the pipeline reads directly from the filesystem.

To make it accessible over a network (e.g. one person runs the server and others connect remotely), you would need to:

1. Bind Flask to the machine's local IP instead of `localhost` (`host='0.0.0.0'` is already set)
2. Other users on the same network point their browser at `http://<server-ip>:3000` and update the `API` constant in `T1T2Selector.jsx` from `localhost:5050` to `<server-ip>:5050`
3. The DICOM files must still live on the server machine

A full cloud deployment (hosting Flask + React on a remote server with the DICOM data uploaded) is a larger change and requires handling file uploads or a shared network drive — not in scope for now.

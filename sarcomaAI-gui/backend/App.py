from flask import Flask, jsonify, request, send_file, abort, Response
from flask_cors import CORS
import os
import json as _json
import csv
import subprocess
import sys
import io
import pydicom
import matplotlib.pyplot as plt
from datetime import datetime
from pathlib import Path
from pydicom.errors import InvalidDicomError

PIPELINE_DIR = os.path.join(os.path.dirname(__file__), '..', 'python_pipeline')
RUNTIME_CONFIG = os.path.join(PIPELINE_DIR, 'runtime_config.json')
pipeline_script = os.path.join(PIPELINE_DIR, 'pipeline.py')

# Set by /api/setup at runtime
DATA_ROOT = None
SELECTION_FILE = None
FIELDNAMES = ['Patient', 'Type', 'Study', 'Series']

app = Flask(__name__)
CORS(app)


def _get_valid_dicom_files(series_path):
    result = []
    for fname in sorted(os.listdir(series_path)):
        if fname.startswith('.'):
            continue
        fp = os.path.join(series_path, fname)
        if not os.path.isfile(fp):
            continue
        try:
            pydicom.dcmread(fp, stop_before_pixels=True)
            result.append(fname)
        except Exception:
            continue
    return result


@app.route('/api/setup', methods=['POST'])
def setup():
    """Receive wizard config from the frontend and persist it for the pipeline."""
    global DATA_ROOT, SELECTION_FILE

    data = request.json
    dicom_folder   = data.get('dicomFolder', '').strip()
    institution    = data.get('institution', '').strip()
    sts_dataset    = data.get('stsDataset', '').strip()
    is_new_dataset = data.get('isNewDataset', True)

    if not dicom_folder or not institution or not sts_dataset:
        return abort(400, "Missing required fields: dicomFolder, institution, stsDataset")

    if not os.path.isdir(dicom_folder):
        return abort(400, f"dicomFolder does not exist: {dicom_folder}")

    DATA_ROOT      = dicom_folder
    SELECTION_FILE = os.path.join(dicom_folder, 'selections.csv')

    # dataset_path is the parent of the DICOM/ folder (pipeline expects DATASET_PATH/DICOM/PA...)
    dataset_path = str(Path(dicom_folder).parent)

    runtime_cfg = {
        "institution":    institution,
        "dataset_path":   dataset_path,
        "sts_dataset":    sts_dataset,
        "selection_csv":  SELECTION_FILE,
        "is_new_dataset": is_new_dataset,
    }
    Path(RUNTIME_CONFIG).write_text(_json.dumps(runtime_cfg, indent=2))

    return jsonify({'status': 'configured', 'dataRoot': DATA_ROOT})


@app.route('/api/run-pipeline', methods=['POST'])
def run_pipeline():
    """Run the anonymization + NIfTI conversion pipeline synchronously."""
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    pipeline_script = os.path.join(PIPELINE_DIR, 'pipeline.py')
    if not os.path.exists(pipeline_script):
        return abort(500, f"pipeline.py not found at {pipeline_script}")

    result = subprocess.run(
        [sys.executable, pipeline_script],
        cwd=PIPELINE_DIR,
        capture_output=True,
        text=True,
        timeout=3600,
    )

    return jsonify({
        'returncode': result.returncode,
        'stdout': result.stdout,
        'stderr': result.stderr,
        'success': result.returncode == 0,
    })


@app.route('/api/patients')
def list_patients():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    print(f"Scanning DATA_ROOT: {DATA_ROOT}")
    if not os.path.exists(DATA_ROOT):
        return jsonify({"error": "Invalid DATA_ROOT path"}), 404

    patients = []
    for pa_folder in sorted(os.listdir(DATA_ROOT)):
        pa_path = os.path.join(DATA_ROOT, pa_folder)
        if not os.path.isdir(pa_path):
            continue
        for st_folder in os.listdir(pa_path):
            st_path = os.path.join(pa_path, st_folder)
            if not os.path.isdir(st_path):
                continue
            for se_folder in os.listdir(st_path):
                se_path = os.path.join(st_path, se_folder)
                if not os.path.isdir(se_path):
                    continue
                for f in os.listdir(se_path):
                    file_path = os.path.join(se_path, f)
                    if not os.path.isfile(file_path):
                        continue
                    try:
                        pydicom.dcmread(file_path, stop_before_pixels=True)
                        relative_path = os.path.relpath(st_path, DATA_ROOT)
                        if relative_path not in patients:
                            patients.append(relative_path)
                        break
                    except Exception:
                        continue
    return jsonify(sorted(set(patients)))


@app.route('/api/series')
def get_series():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient = request.args.get('patient')
    series_path = os.path.join(DATA_ROOT, patient)

    if not os.path.isdir(series_path):
        return abort(404, "Patient path not found")

    series_folders = [
        folder for folder in sorted(os.listdir(series_path))
        if os.path.isdir(os.path.join(series_path, folder))
    ]
    return jsonify(series_folders)


@app.route('/api/slice')
def get_slice():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient   = request.args.get('patient')
    series    = request.args.get('series')
    slice_idx = int(request.args.get('slice', 0))

    series_path = os.path.join(DATA_ROOT, patient, series)
    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    valid_files = _get_valid_dicom_files(series_path)

    if not valid_files:
        return abort(404, "No valid DICOM files in this series")
    if slice_idx < 0 or slice_idx >= len(valid_files):
        return abort(400, "Slice index out of bounds")

    try:
        dcm = pydicom.dcmread(os.path.join(series_path, valid_files[slice_idx]))
    except InvalidDicomError:
        return abort(415, "Invalid DICOM at this slice")

    buf = io.BytesIO()
    plt.imsave(buf, dcm.pixel_array, cmap='gray', format='png')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


@app.route('/api/max-slice')
def get_max_slice():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient = request.args.get('patient')
    series  = request.args.get('series')
    series_path = os.path.join(DATA_ROOT, patient, series)

    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    valid_files = _get_valid_dicom_files(series_path)
    return jsonify({'maxSlice': len(valid_files)})


@app.route('/api/dicom-file')
def get_dicom_file():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient = request.args.get('patient')
    series  = request.args.get('series')
    index   = int(request.args.get('index', 0))

    series_path = os.path.join(DATA_ROOT, patient, series)
    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    valid_files = _get_valid_dicom_files(series_path)
    if not valid_files:
        return abort(404, "No valid DICOM files in this series")
    if index < 0 or index >= len(valid_files):
        return abort(400, "Index out of bounds")

    fp = os.path.join(series_path, valid_files[index])
    response = send_file(fp, mimetype='application/dicom')
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


@app.route('/api/series-metadata')
def get_series_metadata():
    if DATA_ROOT is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient = request.args.get('patient')
    series  = request.args.get('series')
    series_path = os.path.join(DATA_ROOT, patient, series)

    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    valid_files = _get_valid_dicom_files(series_path)
    if not valid_files:
        return abort(404, "No valid DICOM files in this series")

    try:
        dcm = pydicom.dcmread(os.path.join(series_path, valid_files[0]), stop_before_pixels=True)
    except Exception as e:
        return abort(500, f"Failed to read DICOM header: {e}")

    def tag(attr, default=''):
        try:
            val = getattr(dcm, attr, None)
            return str(val).strip() if val is not None else default
        except Exception:
            return default

    return jsonify({
        'seriesDescription': tag('SeriesDescription'),
        'sliceCount': len(valid_files),
        'sliceThickness': tag('SliceThickness'),
        'acquisitionDate': tag('AcquisitionDate') or tag('StudyDate'),
        'modality': tag('Modality'),
    })


@app.route('/api/run-pipeline-stream')
def run_pipeline_stream():
    if DATA_ROOT is None:
        return abort(400, "Not configured")

    def generate():
        process = subprocess.Popen(
            [sys.executable, pipeline_script],
            cwd=PIPELINE_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        for line in process.stdout:
            yield f"data: {_json.dumps({'line': line.rstrip()})}\n\n"
        process.wait()
        yield f"data: {_json.dumps({'done': True, 'returncode': process.returncode})}\n\n"

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
    })


@app.route('/api/save-selection', methods=['POST'])
def save_selection():
    if SELECTION_FILE is None:
        return abort(400, "Not configured. Call /api/setup first.")

    data = request.json
    patient_study = data.get('patient')
    t1_series     = data.get('t1', '')
    t2_series     = data.get('t2', '')

    if not patient_study:
        return abort(400, "Missing patient/study")
    try:
        patient, study = patient_study.split('/')
    except ValueError:
        return abort(400, "Expected patient format 'PAxxxx/STxxxx'")

    rows = []
    if os.path.exists(SELECTION_FILE):
        now = datetime.now().strftime('%Y%m%d_%H%M%S')
        bak = f"{SELECTION_FILE}.{now}.bak"
        os.rename(SELECTION_FILE, bak)
        with open(bak, newline='') as f:
            for row in csv.DictReader(f):
                if not (row['Patient'] == patient and row['Study'] == study):
                    rows.append(row)

    rows.append({'Patient': patient, 'Type': 'T1', 'Study': study, 'Series': t1_series})
    rows.append({'Patient': patient, 'Type': 'T2', 'Study': study, 'Series': t2_series})

    with open(SELECTION_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    return jsonify({'status': 'saved'})


@app.route('/api/get-selection')
def get_selection():
    if SELECTION_FILE is None:
        return abort(400, "Not configured. Call /api/setup first.")

    patient_study = request.args.get('patient')
    if not patient_study:
        return abort(400, "Missing patient/study")
    try:
        patient, study = patient_study.split('/')
    except ValueError:
        return abort(400, "Expected patient format 'PAxxxx/STxxxx'")

    t1, t2 = None, None
    if os.path.exists(SELECTION_FILE):
        with open(SELECTION_FILE, newline='') as f:
            for row in csv.DictReader(f):
                if row['Patient'] == patient and row['Study'] == study:
                    if row['Type'] == 'T1':
                        t1 = row['Series']
                    elif row['Type'] == 'T2':
                        t2 = row['Series']

    return jsonify({'t1': t1, 't2': t2})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)

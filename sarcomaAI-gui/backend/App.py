from flask import Flask, jsonify, request, send_file, abort
from flask_cors import CORS
import os
import pydicom
import matplotlib.pyplot as plt
import io
import csv
from datetime import datetime
from pydicom.errors import InvalidDicomError


DATA_ROOT = "/Users/jonathan/Documents/RI-MUHC/SarcomaAI/Pipeline/Dataset-scrubbed/DICOM"
SELECTION_FILE = "selections.csv"
FIELDNAMES = ['Patient','Type','Study','Series']

app = Flask(__name__)
CORS(app)
SELECTION_FILE = "selections.csv"

@app.route('/api/patients')
def list_patients():
    print(f"🔍 Scanning DATA_ROOT: {DATA_ROOT}")
    if not os.path.exists(DATA_ROOT):
        print(f"❌ DATA_ROOT path does not exist: {DATA_ROOT}")
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
                # Look for DICOM files
                for f in os.listdir(se_path):
                    file_path = os.path.join(se_path, f)
                    if not os.path.isfile(file_path):
                        continue
                    try:
                        dcm = pydicom.dcmread(file_path, stop_before_pixels=True)
                        print("✅ Found valid DICOM:", file_path)  # Debugging line
                        relative_path = os.path.relpath(st_path, DATA_ROOT)
                        if relative_path not in patients:
                            patients.append(relative_path)
                        break  # Stop after finding a valid DICOM file
                    except Exception as e:
                        continue
    print(f"✅ Final patient list: {patients}")
    return jsonify(sorted(set(patients)))

@app.route('/api/series')
def get_series():
    patient = request.args.get('patient')  # e.g., "PA000002/ST000001"
    series_path = os.path.join(DATA_ROOT, patient)

    if not os.path.isdir(series_path):
        return abort(404, "Patient path not found")

    series_folders = []
    for folder in sorted(os.listdir(series_path)):
        full_path = os.path.join(series_path, folder)
        if os.path.isdir(full_path):
            series_folders.append(folder)

    return jsonify(series_folders)

@app.route('/api/slice')
def get_slice():
    patient = request.args.get('patient')
    series  = request.args.get('series')
    slice_idx = int(request.args.get('slice', 0))

    series_path = os.path.join(DATA_ROOT, patient, series)
    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    # collect *all* files, then build a list of *valid* DICOMs
    all_files = sorted([
        f for f in os.listdir(series_path)
        if not f.startswith('.') and os.path.isfile(os.path.join(series_path, f))
    ])

    valid_files = []
    for fname in all_files:
        fp = os.path.join(series_path, fname)
        try:
            # just test the header first
            _ = pydicom.dcmread(fp, stop_before_pixels=True)
            valid_files.append(fname)
        except InvalidDicomError:
            # skip anything that isn't a well-formed DICOM
            continue

    if not valid_files:
        return abort(404, "No valid DICOM files in this series")

    if slice_idx < 0 or slice_idx >= len(valid_files):
        return abort(400, "Slice index out of bounds")

    # now load the actual pixel data
    dcm_path = os.path.join(series_path, valid_files[slice_idx])
    try:
        dcm = pydicom.dcmread(dcm_path)
    except InvalidDicomError:
        return abort(415, "Invalid DICOM at this slice")

    img = dcm.pixel_array
    buf = io.BytesIO()
    plt.imsave(buf, img, cmap='gray', format='png')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

@app.route('/api/save-selection', methods=['POST'])
def save_selection():
    data = request.json
    patient_study = data.get('patient')      # e.g. "PA000002/ST000001"
    t1_series     = data.get('t1', '')
    t2_series     = data.get('t2', '')

    if not patient_study:
        return abort(400, "Missing patient/study")

    try:
        patient, study = patient_study.split('/')
    except ValueError:
        return abort(400, "Expected patient format 'PAxxxx/STxxxx'")

    # Read & filter out any existing rows for this patient+study
    rows = []
    if os.path.exists(SELECTION_FILE):
        # backup old
        now = datetime.now().strftime('%Y%m%d_%H%M%S')
        os.rename(SELECTION_FILE, f"{SELECTION_FILE}.{now}.bak")

        with open(f"{SELECTION_FILE}.{now}.bak", newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not (row['Patient'] == patient and row['Study'] == study):
                    rows.append(row)

    # Append the two new rows (T1 and T2)
    rows.append({'Patient': patient, 'Type': 'T1', 'Study': study, 'Series': t1_series})
    rows.append({'Patient': patient, 'Type': 'T2', 'Study': study, 'Series': t2_series})

    # Write out CSV with new schema
    with open(SELECTION_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    return jsonify({'status': 'saved'})

@app.route('/api/get-selection')
def get_selection():
    patient_study = request.args.get('patient')  # e.g. "PA000002/ST000001"
    if not patient_study:
        return abort(400, "Missing patient/study")

    try:
        patient, study = patient_study.split('/')
    except ValueError:
        return abort(400, "Expected patient format 'PAxxxx/STxxxx'")

    t1, t2 = None, None
    if os.path.exists(SELECTION_FILE):
        with open(SELECTION_FILE, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['Patient'] == patient and row['Study'] == study:
                    if row['Type'] == 'T1':
                        t1 = row['Series']
                    elif row['Type'] == 'T2':
                        t2 = row['Series']

    return jsonify({'t1': t1, 't2': t2})

@app.route('/api/max-slice')
def get_max_slice():
    patient = request.args.get('patient')
    series = request.args.get('series')
    series_path = os.path.join(DATA_ROOT, patient, series)

    if not os.path.isdir(series_path):
        return abort(404, "Series not found")

    all_files = sorted([
        f for f in os.listdir(series_path)
        if not f.startswith('.') and os.path.isfile(os.path.join(series_path, f))
    ])

    valid_files = []
    for fname in all_files:
        fp = os.path.join(series_path, fname)
        try:
            _ = pydicom.dcmread(fp, stop_before_pixels=True)
            valid_files.append(fname)
        except Exception:
            continue

    return jsonify({'maxSlice': len(valid_files)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)

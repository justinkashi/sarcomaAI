from pathlib import Path
import pydicom as pd

from config import DEFAULT_GLOB
from constants import PATIENT_ID_TAG, CLINICAL_TRIAL_SUBJECT_ID_TAG

def build_sts_name(institution: str, numeric_id: int, modality: str) -> str:
    """
    Construct a standardized STS name: sts.INSTITUTION.NUMERIC_ID.MODALITY.
    Raises:
        ValueError: if institution is not a 3-digit code or modality is not 't1' or 't2'.
    """
    if not (institution.isdigit() and len(institution) == 3):
        raise ValueError("Institution code must be exactly three digits (e.g. '002').")
    
    mod = modality.lower()
    
    if mod not in {"t1", "t2"}:
        raise ValueError("Modality must be 't1' or 't2'.")
    return f"sts.{institution}.{numeric_id:06d}.{mod}"


def get_unique_mrn(series_dir: Path, pattern: str) -> str:
    """
    Extract a consistent PatientID (MRN) from DICOM series.
    Raises:
        RuntimeError: if no MRN is found or if multiple inconsistent MRNs are present.
    """
    mrn: str | None = None
    for dcm_path in series_dir.glob(pattern):
        
        # Retrieve the MRN associated with a given image
        ds = pd.dcmread(dcm_path, force=True)
        current_mrn = str(ds.get(PATIENT_ID_TAG, "").value).strip() if ds.get(PATIENT_ID_TAG) else ""
        
        # Confirm that the MRN is consistent with the stored value
        if current_mrn:
            if mrn is None:
                mrn = current_mrn
            elif current_mrn != mrn:
                raise RuntimeError(f"Inconsistent MRNs in {series_dir}: '{mrn}' vs '{current_mrn}'")
    
    if mrn is None:
        raise RuntimeError(f"No PatientID found in {series_dir}")
    return mrn


def process_series_metadata(series_dir: Path, sts_name: str, *, file_pattern: str = DEFAULT_GLOB) -> str:
    """
    Update DICOM series metadata by setting the Clinical Trial Subject ID to the STS name.
    If the tag exists, its value is replaced. If not, the tag is added.
    
    Returns the unique MRN for the series.
    """
    mrn = get_unique_mrn(series_dir, file_pattern)
    
    for dcm_path in series_dir.glob(file_pattern):
        ds = pd.dcmread(dcm_path, force=True)

        # Set or replace Clinical Trial Subject ID
        if CLINICAL_TRIAL_SUBJECT_ID_TAG in ds:
            ds[CLINICAL_TRIAL_SUBJECT_ID_TAG].value = sts_name
        else:
            ds.add_new(CLINICAL_TRIAL_SUBJECT_ID_TAG, "LO", sts_name)

        ds.save_as(dcm_path, enforce_file_format=True)

    return mrn
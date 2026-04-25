import json
from pathlib import Path
from typing import Set

import pydicom as pd
from pydicom.dataset import Dataset

from config import DEFAULT_GLOB

import logging
logger = logging.getLogger(__name__)

# Default path to stored sensitive field list
_FIELDS_DIR = Path(__file__).resolve().parent.parent / "anonymization_fields"
_FIELDS_FILE = _FIELDS_DIR / "sensitive_fields.json"

# Fallback sensitive fields if config file is missing or malformed
_DEFAULT_FIELDS: Set[str] = {
    "Performed Procedure Step Description",
    "PatientName",
    "InstitutionName",
    "ContentDate",
    "AcquisitionDate",
    "PatientSex",
    "RequestedProcedureID",
    "AccessionNumber",
    "StationName",
    "ImplementationVersionName",
    "PatientSize",
    "PerformedProcedureStepID",
    "PatientBirthDate",
    "PatientWeight",
    "PerformingPhysicianName",
    "PerformedProcedureStepStartDate",
    "PatientID",
    "OperatorsName",
    "ModifyingSystem",
    "CodeValue",
    "StudyID",
    "PatientAge",
    "StudyDate",
    "OtherPatientIDs",
    "SourceOfPreviousValues",
    "InstitutionAddress",
    "IssuerOfPatientID",
    "SeriesDate",
    "AcquisitionDateTime",
    "ReasonForTheAttributeModification",
    "StudyDescription",
    "AttributeModificationDateTime",
    "PerformedProcedureStepDescription",
    "ReferringPhysicianName"
}

# Valid DICOM placeholders
_DUMMY_DATE = "19000101"
_DUMMY_DATETIME = "19000101000000"  # valid DT

def load_sensitive_fields(config_file: Path = _FIELDS_FILE) -> Set[str]:
    """
    Load the set of sensitive DICOM keywords from JSON config.
    Falls back to internal default list if the file is missing or invalid.
    """
    if config_file.exists():
        try:
            with config_file.open() as f:
                return set(json.load(f))
        except Exception as exc:
            logger.warning("Failed to read %s (%s) - using defaults.", config_file, exc)
    return _DEFAULT_FIELDS.copy()


def save_sensitive_fields(fields: Set[str], config_file: Path = _FIELDS_FILE) -> None:
    """Persist the given field set as sorted, pretty-printed JSON."""
    try:
        with config_file.open("w") as f:
            json.dump(sorted(fields), f, indent=4)
        logger.info("Sensitive field list saved to %s", config_file)
    except Exception as exc:
        logger.error("Failed to save sensitive fields (%s)", exc)


def add_sensitive_field(field: str, config_file: Path = _FIELDS_FILE) -> None:
    """Add a field to the sensitive set and update the config file."""
    fields = load_sensitive_fields(config_file)
    if field not in fields:
        fields.add(field)
        save_sensitive_fields(fields, config_file)
        logger.info("Added sensitive field %s", field)


def remove_sensitive_field(field: str, config_file: Path = _FIELDS_FILE) -> None:
    """Remove a field from the sensitive set and update the config file."""
    fields = load_sensitive_fields(config_file)
    if field in fields:
        fields.remove(field)
        save_sensitive_fields(fields, config_file)
        logger.info("Removed sensitive field %s", field)


def _anon_value(vr: str) -> str:
    """
    Return an anonymized placeholder based on the DICOM value representation.
    """
    if vr == "DA":            # Date
        return _DUMMY_DATE
    if vr == "DT":            # DateTime
        return _DUMMY_DATETIME
    if vr == "AS":            # Age String
        return "000Y"
    if vr == "DS":            # Decimal String
        return "0"
    return "ANONYMIZED"


def _scrub_dataset(ds: Dataset, sensitive: Set[str]) -> None:
    """
    Replace sensitive fields in a dataset with anonymized values.
    Recursively processes sequences (VR == 'SQ').
    """
    for elem in ds:
        if elem.VR == "SQ":
            for item in elem.value:
                _scrub_dataset(item, sensitive)
            continue
        if elem.keyword in sensitive:
            elem.value = _anon_value(elem.VR)


def _mark_removed(ds: Dataset) -> None:
    """Set PatientIdentityRemoved tag to "YES"."""
    ds.PatientIdentityRemoved = "YES"


def anonymize_series(series_dir: Path, glob_pat: str = DEFAULT_GLOB) -> None:
    """
    Anonymize all DICOM files in a series folder.
    Overwrites files in place after removing sensitive metadata.
    """    
    sensitive = load_sensitive_fields()
    for img in series_dir.glob(glob_pat):
        try:
            ds = pd.dcmread(img, force=True)
        except Exception as exc:
            logger.warning("Skip unreadable %s (%s)", img, exc)
            continue
        _scrub_dataset(ds, sensitive)
        _mark_removed(ds)
        tmp = img.with_suffix(img.suffix + ".tmp")
        try:
            ds.save_as(tmp)
            tmp.replace(img)
        except Exception as exc:
            logger.error("Write failed for %s: %s", img, exc)
            tmp.unlink(missing_ok=True)

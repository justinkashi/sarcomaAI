"""
pipeline.py — Copy selected DICOM series, anonymize them, and update the project ledger.

Key rules
---------
* Ledger has 7 columns: Institution, MRN, Patient, Study, Series, Modality, MMNN Reference
* Crash-tolerant: each row is appended as soon as its series is processed
"""

from __future__ import annotations

import logging

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

from config import (
    INSTITUTION,
    DATASET_PATH,
    STS_DATASET,
    SELECTION_CSV,
    IS_NEW_DATASET,
)

from ledger import (
    write_empty_ledger,
    append_ledger_row,
    _highest_patient_id_in_ledger,
    _highest_patient_id_on_disk,
)

from dicom.dicom_anonymize import anonymize_series
from dicom.dicom_tags import process_series_metadata

from imaging.imaging_normalize import bias_correct_and_standardize
from imaging.imaging_io import atomic_write_sitk

from series_select import copy_selected_series

def main() -> None:
    """Main pipeline for DICOM selection, anonymization, conversion, and ledger update."""
    dataset, sts_dataset, selection_csv = (
        DATASET_PATH.resolve(),
        STS_DATASET.resolve(),
        SELECTION_CSV.resolve(),
    )
    ledger_csv = sts_dataset / "ledger.csv"

    if not dataset.exists():
        raise FileNotFoundError(dataset)
    if not selection_csv.exists():
        raise FileNotFoundError(selection_csv)

    sts_dataset.mkdir(parents=True, exist_ok=True)
    if IS_NEW_DATASET and not ledger_csv.exists():
        write_empty_ledger(ledger_csv)

    # Determine next patient ID
    start_id = max(
        _highest_patient_id_in_ledger(ledger_csv),
        _highest_patient_id_on_disk(sts_dataset),
    )
    logger.info("Next new Patient ID will start at PA%06d", start_id + 1)

    # Copy selected DICOM series
    series_info = copy_selected_series(
        dataset, sts_dataset, selection_csv, INSTITUTION, start_id
    )
    logger.info("Selected %d series", len(series_info))

    root_dir = sts_dataset.parent / f"sts.{INSTITUTION}"  # e.g. sts.002/

    for info in series_info:
        series_path = sts_dataset / "DICOM" / info.new_id / info.study / info.series
        
        # Extract MRN and insert STS name
        info.mrn = process_series_metadata(series_path, info.sts_name)

        # Anonymize in place
        anonymize_series(series_path)
        logger.info("Anonymized %s", series_path.relative_to(sts_dataset))

        patient_dir = root_dir / f"sts.{INSTITUTION}.{info.new_id[2:]}"  # sts.002.000123/
        nifti_path = patient_dir / f"sts.{INSTITUTION}.{info.new_id[2:]}.{info.modality}.nii"

        # Skip if already processed
        if nifti_path.exists():
            logger.info("NIfTI already exists, skipping: %s", nifti_path)
            success = True
        else:
            img = bias_correct_and_standardize(series_path)
            success = img is not None
            if success:
                atomic_write_sitk(img, nifti_path)
                logger.info("Saved NIfTI → %s", nifti_path)

        if not success:
            logger.warning("Processing failed for %s; ledger not updated.", info.sts_name)
            continue

        # Append new entry to ledger
        append_ledger_row(
            ledger_csv,
            [INSTITUTION, info.mrn, info.new_id, info.study, info.series, info.modality, info.sts_name],
        )
        logger.info(
            "Ledger appended: %s (MRN %s, %s)", info.new_id, info.mrn, info.modality.upper()
        )


if __name__ == "__main__":
    main()

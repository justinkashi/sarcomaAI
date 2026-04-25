from pathlib import Path
from typing import Dict, Set, List
from models import SeriesInfo
from csv_utils import load_csv
from dicom.dicom_tags import build_sts_name
from dicom.dicom_utils import _series_is_complete
from dicom.dicom_copy import copy_path_safe

import logging

logger = logging.getLogger(__name__)

from constants import SELECTION_HEADERS

def copy_selected_series(
    dataset: Path,
    sts_dataset: Path,
    selection_csv: Path,
    institution: str,
    start_id: int,
) -> List[SeriesInfo]:
    """
    Copy selected DICOM series from the original dataset into the STS dataset with incremented patient IDs.

    Each original patient ID (orig_id) is assigned a new incremented patient ID (PAXXXXXX).
    Series are copied only if not already present or incomplete. Ensures uniqueness of 
    (patient, modality) per run and generates an STS name identifier for each entry.

    Parameters:
        dataset: Root path of original DICOM dataset.
        sts_dataset: Destination root path for STS-formatted dataset.
        selection_csv: CSV file listing selected series to process.
        institution: Institution code (e.g., '002') used to generate STS names.
        start_id: Highest used PAXXXXXX ID, used to generate the next available one.

    Returns:
        List of SeriesInfo records with mapping from original to new IDs and STS names.
    """
    results: List[SeriesInfo] = []
    current_id = start_id
    orig_to_new: Dict[str, str] = {}         # Track assigned PAxxxxxx per orig_id
    seen_run: Set[tuple[str, str]] = set()   # Track (orig_id, modality) to detect duplicates

    for row in load_csv(selection_csv, required_headers=SELECTION_HEADERS):
        orig_id, study, series, modality = (
            row["Patient"],
            row["Study"],
            row["Series"],
            row["Type"].lower(),
        )

        # Assign new ID if not already assigned
        if orig_id in orig_to_new:
            new_id = orig_to_new[orig_id]
        else:
            current_id += 1
            new_id = f"PA{current_id:06d}"
            orig_to_new[orig_id] = new_id

        sts_name = build_sts_name(institution, int(new_id[2:]), modality)
        src = dataset / "DICOM" / orig_id / study / series
        dst = sts_dataset / "DICOM" / new_id / study / series

        # Check if destination already exists and is valid
        if dst.exists():
            if _series_is_complete(dst, sts_name):
                logger.info("Series %s already complete; skipping copy.", dst)
            else:
                raise RuntimeError(f"Destination {dst} exists but is incomplete or mismatched.")
        else:
            if not src.exists():
                raise FileNotFoundError(src)
            copy_path_safe(src, dst)

        # Create mapping record
        results.append(SeriesInfo(orig_id, new_id, sts_name, study, series, modality))
        
        # Prevent duplicate (patient, modality) entries in same run
        seen_key = (orig_id, modality)
        if seen_key in seen_run:
            raise RuntimeError(
                f"Duplicate modality {modality.upper()} for source patient {orig_id} within this run"
            )
        seen_run.add(seen_key)

    return results
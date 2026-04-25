from pathlib import Path
import pydicom as pd

from config import DEFAULT_GLOB
from constants import CLINICAL_TRIAL_SUBJECT_ID_TAG

def _series_is_complete(series_dir: Path, expected_sts_name: str, pattern: str = DEFAULT_GLOB) -> bool:
    """
    Return True if any readable DICOM file in the series contains the expected
    Clinical Trial Subject ID (0012,0040) matching the given STS name.

    Used to verify whether a series has already been processed and labeled.
    """
    for dcm_path in series_dir.glob(pattern):
        try:
            ds = pd.dcmread(dcm_path, force=True)
            tag_val = str(ds.get(CLINICAL_TRIAL_SUBJECT_ID_TAG, "").value) \
                if CLINICAL_TRIAL_SUBJECT_ID_TAG in ds else ""
            if tag_val == expected_sts_name:
                return True
        except Exception:
            continue
    return False
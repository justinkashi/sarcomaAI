from pydicom.tag import Tag
from typing import List

PATIENT_ID_TAG = Tag(0x0010, 0x0020)
CLINICAL_TRIAL_SUBJECT_ID_TAG = Tag(0x0012, 0x0040)

LEDGER_HEADER: List[str] = [
    "Institution",
    "MRN",
    "Patient",
    "Study",
    "Series",
    "Modality",
    "MMNN Reference",
]
SELECTION_HEADERS = ("Patient", "Study", "Series", "Type")
from pathlib import Path
import csv
from typing import List

from constants import LEDGER_HEADER
from csv_utils import load_csv

def write_empty_ledger(path: Path) -> None:
    """Create an empty ledger CSV file with header."""
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=LEDGER_HEADER).writeheader()


def append_ledger_row(ledger_csv: Path, row: List[str]) -> None:
    """Append a new row to the ledger CSV."""
    with ledger_csv.open("a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow(row)


def _highest_patient_id_in_ledger(ledger_csv: Path) -> int:
    """Return the highest patient ID from the ledger CSV."""
    if not ledger_csv.is_file() or ledger_csv.stat().st_size == 0:
        return 0
    rows = load_csv(ledger_csv, required_headers=LEDGER_HEADER)
    ids = [int(r["Patient"][2:]) for r in rows
           if r["Patient"].startswith("PA") and r["Patient"][2:].isdigit()] # Configured for PAXXXXXX naming convention
    return max(ids, default=0)


def _highest_patient_id_on_disk(sts_dataset: Path) -> int:
    """Return the highest patient ID found in the DICOM directory."""
    dicom_root = sts_dataset / "DICOM"
    if not dicom_root.exists():
        return 0
    ids = [int(p.name[2:]) for p in dicom_root.iterdir()
           if p.is_dir() and p.name.startswith("PA") and p.name[2:].isdigit()] # Configured for PAXXXXXX naming convention
    return max(ids, default=0)


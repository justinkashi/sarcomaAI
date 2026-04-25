from pathlib import Path
import csv
from typing import Iterable, List, Dict

def _validate_headers(found: Iterable[str] | None, expected: Iterable[str], src: Path) -> None:
    """Raise ValueError if any expected CSV headers are missing."""
    missing = set(expected) - set(found or [])
    if missing:
        raise ValueError(f"{src}: missing required CSV column(s): {', '.join(sorted(missing))}")


def load_csv(path: Path, *, required_headers: Iterable[str] | None = None) -> List[Dict[str, str]]:
    """
    Load a CSV file into a list of dictionaries, one per row.
    Validates presence of required headers if specified.
    """
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if required_headers:
            _validate_headers(reader.fieldnames, required_headers, path)
        return list(reader)
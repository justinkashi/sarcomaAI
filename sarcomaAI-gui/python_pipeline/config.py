import json
from pathlib import Path

_RUNTIME_CONFIG = Path(__file__).parent / "runtime_config.json"

def _load() -> dict:
    if _RUNTIME_CONFIG.exists():
        return json.loads(_RUNTIME_CONFIG.read_text())
    return {}

_cfg = _load()

INSTITUTION   = _cfg.get("institution", "002")
# DATASET_PATH is the parent of the DICOM/ folder (series_select expects DATASET_PATH/DICOM/PA.../...)
DATASET_PATH  = Path(_cfg["dataset_path"]) if "dataset_path" in _cfg else Path()
STS_DATASET   = Path(_cfg["sts_dataset"])  if "sts_dataset"  in _cfg else Path()
SELECTION_CSV = Path(_cfg["selection_csv"]) if "selection_csv" in _cfg else Path()
IS_NEW_DATASET = _cfg.get("is_new_dataset", True)
DEFAULT_GLOB  = "IM*"
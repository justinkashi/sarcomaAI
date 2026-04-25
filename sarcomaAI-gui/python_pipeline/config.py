from pathlib import Path

INSTITUTION = "002"  # exactly three digits
DATASET_PATH = Path(
    r"C:/Users/josho/OneDrive - McGill University/MGH-SRC/Pipeline Workspace/Dataset_True_Copy"
)
STS_DATASET = Path(
    r"C:/Users/josho/OneDrive - McGill University/MGH-SRC/Pipeline Workspace/STS_002_Dataset"
)
SELECTION_CSV = Path(
    r"C:/Users/josho/OneDrive - McGill University/MGH-SRC/Pipeline Workspace/Dataset_True_Copy/selection.csv"
)
IS_NEW_DATASET = True  # True only on very first import
DEFAULT_GLOB = "IM*"  # or "*.dcm"
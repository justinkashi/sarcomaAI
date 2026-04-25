from dataclasses import dataclass
from typing import Optional

@dataclass
class SeriesInfo:
    orig_id: str
    new_id: str
    sts_name: str
    study: str
    series: str
    modality: str
    mrn: Optional[str] = None
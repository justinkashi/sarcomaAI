from pathlib import Path
import SimpleITK as sitk
from tempfile import NamedTemporaryFile

def atomic_write_sitk(img: sitk.Image, out_path: Path) -> None:
    """
    Atomically write a SimpleITK image to disk.
    Writes to a temporary file first, then moves it to 'out_path' to avoid partial writes.
    """    
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Create temporary file in the target directory
    tmp = NamedTemporaryFile(dir=out_path.parent, suffix=".nii", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    # Write image to temporary file, then replace target
    sitk.WriteImage(img, str(tmp_path))
    tmp_path.replace(out_path)
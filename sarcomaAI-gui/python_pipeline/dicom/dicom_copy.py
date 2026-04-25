from pathlib import Path
import shutil

import logging

logger = logging.getLogger(__name__)


def copy_path_safe(src: Path, dst: Path, *, skip_existing: bool = True, overwrite: bool = False) -> None:
    """
    Copy a file or directory from src to dst with safety checks.

    - Raises FileNotFoundError if src does not exist.
    - Raises ValueError if both skip_existing and overwrite are True.
    - Skips copy if dst exists and skip_existing is True.
    - Raises FileExistsError if dst exists and overwrite is False.
    - Overwrites file if overwrite is True and src is a file.
    """
    if not src.exists():
        raise FileNotFoundError(src)
    if skip_existing and overwrite:
        raise ValueError("skip_existing and overwrite are mutually exclusive.")
    
    dst.parent.mkdir(parents=True, exist_ok=True)
    
    if dst.exists():
        if skip_existing:
            return
        if not (overwrite and src.is_file()):
            raise FileExistsError(dst)
    
    if src.is_file():
        shutil.copy2(src, dst)
    else:
        shutil.copytree(src, dst, dirs_exist_ok=True)

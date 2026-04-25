import logging
import random
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pydicom as pd
import SimpleITK as sitk

from config import DEFAULT_GLOB

logger = logging.getLogger(__name__)


def _show_pair(img1: np.ndarray, img2: np.ndarray,
               title1: str, title2: str) -> None:
    """
    Display img1 and img2 side-by-side using grayscale colormap.
    Skips display if images are identical.
    """
    if np.array_equal(img1, img2):
        logger.warning("The two images are identical; aborting plot.")
        return

    _, ax = plt.subplots(1, 2, figsize=(12, 6))
    ax[0].imshow(img1, cmap="gray")
    ax[0].set_title(title1)
    ax[0].axis("off")

    ax[1].imshow(img2, cmap="gray")
    ax[1].set_title(title2)
    ax[1].axis("off")

    plt.tight_layout()
    plt.show()


def _load_volume(series_path: Path, glob_pattern: str = DEFAULT_GLOB):
    """
    Load a full DICOM series from disk into a SimpleITK image and NumPy array.
    Returns:
        (SimpleITK.Image, ndarray) pair
    """
    files = sorted(str(p) for p in series_path.glob(glob_pattern) if p.is_file())
    if not files:
        raise FileNotFoundError(f"No files matching '{glob_pattern}' in {series_path}")

    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(files)
    image = reader.Execute()
    array = sitk.GetArrayFromImage(image)

    return image, array


def compare_random_images(original_series: Path,
                          corrected_nifti: Path,
                          seed: int | None = None) -> None:
    """
    Plot a random DICOM slice beside the corresponding processed NIfTI slice.
    Accounts for reverse slice ordering between DICOM and NIfTI formats.
    """
    if seed is not None:
        random.seed(seed)

    images = [p for p in original_series.glob(DEFAULT_GLOB) if p.is_file()]
    if not images:
        raise FileNotFoundError(f"No images in {original_series}")

    images.sort()
    idx = random.randrange(len(images))

    # Load random DICOM slice
    ds = pd.dcmread(images[idx], force=True)
    img_dicom = ds.pixel_array

    # Load corresponding slice from processed NIfTI
    vol = sitk.GetArrayFromImage(sitk.ReadImage(str(corrected_nifti)))
    img_nifti = vol[vol.shape[0] - idx - 1]  # DICOM ordering ↔ NIfTI ordering

    _show_pair(img_dicom, img_nifti, "Original DICOM", "Processed NIfTI")


def compare_histograms(original_series: Path,
                       processed_nifti: Path) -> None:
    """
    Display histograms of voxel intensities before and after processing.
    """
    _, vol_orig = _load_volume(original_series)
    vol_proc = sitk.GetArrayFromImage(sitk.ReadImage(str(processed_nifti)))

    plt.figure(figsize=(12, 6))

    plt.subplot(1, 2, 1)
    plt.hist(vol_orig.flatten(), bins=100, color="blue", alpha=0.7)
    plt.title("Original distribution")
    plt.xlabel("Intensity")
    plt.ylabel("Frequency")

    plt.subplot(1, 2, 2)
    plt.hist(vol_proc.flatten(), bins=100, color="green", alpha=0.7)
    plt.title("Processed distribution")
    plt.xlabel("Intensity (processed)")

    plt.tight_layout()
    plt.show()

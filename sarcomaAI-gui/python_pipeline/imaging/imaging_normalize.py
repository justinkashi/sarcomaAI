from pathlib import Path
import numpy as np
import SimpleITK as sitk

import logging

logger = logging.getLogger(__name__)

def bias_correct_and_standardize(series_dir: Path) -> sitk.Image | None:
    """
    Perform N4 bias field correction and Z-score normalization on a DICOM series.

    Uses CERR to load the series and extract the scan array. Applies:
    1. N4 bias field correction (SimpleITK).
    2. Percentile-based intensity clipping (0.5-99.5%).
    3. Z-score normalization (mean=0, std=1).
    
    Returns:
        A SimpleITK.Image with corrected and normalized data, or None on failure.
    """
    try:
        from cerr import plan_container as pc
        from cerr.dataclasses import scan as scn
    except ImportError as exc:  # pragma: no cover
        logger.error("CERR not available: %s", exc)
        return None

    try:
        # Load DICOM series using CERR
        planC = pc.loadDcmDir(str(series_dir))
        scan_num = 0
        itk_orig = planC.scan[scan_num].getSitkImage()

        logger.info("N4 bias correction on %s", series_dir.name)
        
        # Apply N4 bias correction
        corrector = sitk.N4BiasFieldCorrectionImageFilter()
        corrector.SetMaximumNumberOfIterations([20, 20, 10])
        _ = corrector.Execute(itk_orig)

        # Get log bias field and remove it from original scan
        log_bf_img = corrector.GetLogBiasFieldAsImage(itk_orig)
        log_bf_arr = scn.getCERRScanArrayFromITK(log_bf_img, scan_num, planC)
        corrected = planC.scan[scan_num].getScanArray() / np.exp(log_bf_arr)

        # Clip intensities to 0.5–99.5th percentile to suppress outliers
        lo, hi = np.percentile(corrected, [0.5, 99.5])
        corrected = np.clip(corrected, lo, hi)
        
        # Normalize to zero mean, unit variance
        mean, std = corrected.mean(), max(corrected.std(), 1e-8)
        norm_arr  = (corrected - mean) / std

        # Import normalized volume back into CERR and return as SimpleITK image
        x, y, z = planC.scan[scan_num].getScanXYZVals()
        planC = pc.importScanArray(norm_arr, x, y, z, 'Bias Corrected and Normalised NIfTI', scan_num, planC)

        return planC.scan[-1].getSitkImage()

    except Exception as exc:
        logger.error("N4/Z-score failed for %s: %s", series_dir, exc)
        return None
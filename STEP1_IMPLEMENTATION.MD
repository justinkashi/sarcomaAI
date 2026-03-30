# STEP 1 - WSI PROCESSING - VIRCHOW2 IMPLEMENTATION 

## Objective
Convert raw Whole Slide Images (WSIs) into a single 12-dimensional patient-level feature vector compatible with the SarcomaAI 2.0 late-fusion layer.

## Context & Assets
- **Foundation Model:** [paige-ai/Virchow2](https://huggingface.co/paige-ai/Virchow2) (Gated model, ViT-H/14 architecture).
- **Base Repository:** [DigITs-AIML/MMNN_STS](https://github.com/DigITs-AIML/MMNN_STS).
- **Target Resolution:** 0.5 microns per pixel (mpp) / 20x magnification.

## Technical Execution Pipeline

### 1. Slide Standardization
- **Resampling:** Detect native resolution from WSI metadata. Downsample (e.g., 40x to 20x) to reach 0.5 mpp using `cuCIM` or `OpenSlide`.
- **Stain Normalization:** Apply **Macenko Normalization** to map all slides to a reference color distribution, mitigating lab-specific batch effects across institutions.

### 2. Pre-processing & Tiling
- **Segmentation:** Apply Otsu thresholding on a 1.25x thumbnail to create a binary tissue mask.
- **Tiling:** Extract non-overlapping 224x224 pixel patches. 
- **Filtering:** Retain only patches with >50% tissue area.
- **Metadata:** Store patch (x, y) coordinates for later Attention Heatmap reconstruction.

### 3. Feature Extraction (Virchow-2 Inference)
- **Settings:** `torch.inference_mode()`, FP16 Mixed Precision.
- **Backbone:** ViT-H/14.
- **Token Slicing:** - Input: 224x224 tile.
  - Output: `[1, 261, 1280]` tensor.
  - Slicing Logic: 
    - `class_token = output[:, 0]` (index 0).
    - `patch_tokens = output[:, 5:]` (indices 5-260).
    - **Discard** indices 1-4 (Register tokens).
- **Embedding Formulation:** Concatenate CLS token with the mean of patch tokens.
  $$f_{tile} = [CLS_{token}; \text{mean}(Patch_{tokens})] \in \mathbb{R}^{2560}$$

### 4. Patient-Level Aggregation
- **Method:** Attention-based Multiple Instance Learning (ABMIL).
- **Logic:** Calculate a learned attention weight $a_i$ for every tile $i$ in a patient's "bag."
  $$V_{patient} = \sum_{i=1}^{N} a_i f_i$$
- **Final Projection:** A linear layer to project the 2560-dim vector to a **12-dimensional** vector to maintain parity with MRI/Clinical branches in the MMNN_STS model.

## Success Metrics
- **Verification:** Correct mapping of patient IDs between WSI filenames and clinical metadata.
- **Output:** A `.pt` or `.csv` file containing 12-dim vectors for each patient.
- **Interpretability:** Generation of a `.json` containing normalized attention weights for heatmap projection.

NOTES FROM JUSTIN : DO NOT GET AHEAD OF YOURSELF ALOT OF THIS IN THE PLAN MAY NOT APPLY OR MAY NOT BE ACCURATE, ALWAYS TAKE WITH GRAIN OF SALT WITH CRITICAL THINKING. 
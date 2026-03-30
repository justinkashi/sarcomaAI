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

### 5. March 30 List of Potential Errors of WSI_PROCESS_MAC.py Template

# Code Errors 
CRASH: 
1. openslide never imported. NameError on first use.

2. WSI_DIR and OUTPUT_DIR commented out but referenced in main(). NameError.

3. Model loads at module level (lines 38-47). Crashes immediately if HF_TOKEN is unset, even on import.

4. No error handling around openslide.OpenSlide() (line 188). A single corrupt WSI kills the entire batch run.

5. slide.close() not in a finally block. If any step raises between open and close, file handle leaks.

6. MPS + SwiGLUPacked precision issues. Some timm layers aren't implemented for float16 on Metal. Will crash with "not implemented for 'Half'" unless you force .float() on the input tensors or handle autocast.

SILENT: 
7. Tile read geometry is wrong (lines 130-136). On a 40x slide at level 0, read_region((x,y), 0, (224, 224)) gives 224 pixels at 40x, not 20x. Read size should be int(TILE_SIZE * target_downsample / level_downsample), then resize to 224. Embeddings will be at the wrong magnification.

8. Duplicate read_region call (lines 130 + 135). First read is discarded when levels don't match. The corrected size formula on line 134 is also wrong.

9. model() vs model.forward_features(). Standard timm forward() runs pooling after features. Virchow 2 probably returns (B, 261, 1280) from forward() because num_classes=0, but this is implicit. A timm update or config mismatch would silently give (B, 1280) and the token slicing would grab wrong data. Use model.forward_features() to be explicit.

10. MPP fallback assumes 40x (line 61). When metadata is missing, you default to native_mpp = 0.25 (40x). If the slide is actually 20x (common in older trial data like SARC-032), you'd compute downsample = 0.5/0.25 = 2x, effectively extracting at 10x magnification — biologically meaningless for Virchow 2. Should check slide.properties.get("aperio.AppMag") as a secondary fallback.

11. Tissue mask shape mismatch. get_thumbnail() doesn't guarantee exact dims // seg_downsample — it preserves aspect ratio. Coordinate-to-mask indexing drifts on large slides, filtering wrong tiles.

12. No stain normalization. Required per STEP1_IMPLEMENTATION.MD for cross-institutional consistency (MSKCC vs MUHC). Without it, embeddings are biased by institution-specific H&E staining. Should apply Macenko normalization (e.g., tiatoolbox.tools.stainnorm.MacenkoNormalizer) to tiles before embedding.

LONG-TERM: 
13. All tiles held in RAM as PIL Images. A large slide (50k tiles) can eat 5+ GB before inference starts. Will OOM or swap-thrash on Mac.

14. No progress indication for tile extraction loop. Only the inference loop has progress now — tiling a large slide can also take minutes with no feedback.

15. transforms variable name shadows potential imports. Should be tile_transforms.


# ML Errors  
1. The "Aggregator" Training Gap (Step 1.5)We’ve talked about extracting features with Virchow-2 and using ABMIL to aggregate them.The Error: You cannot just plug an untrained ABMIL head into the MMNN_STS model and expect it to work. Virchow-2 is frozen, but the ABMIL layers (which learn the attention weights $a_i$) have millions of parameters that need to be trained.The Problem: If you train the ABMIL head at the same time as the rest of the 4-branch model, the MRI and Clinical branches (which are already somewhat "mature") will provide a clear signal, while the Pathology branch will provide random noise. The optimizer will likely "zero out" the Pathology branch before the ABMIL head even learns what a tumor cell looks like.The Fix: You must pre-train the Pathology Branch as a standalone survival model (Path-only) using TCGA data. Once the ABMIL head knows how to identify high-risk features, you "transplant" those weights into the quadrimodal MMNN_STS model.
2. Intermediate vs. Late FusionCurrently, the plan is Late Fusion (concatenating vectors at the very end).The Error: This assumes MRI, Pathology, and Genomics are independent. In Sarcoma biology, they are deeply intertwined. For example, a "Genomic Ecotype" (SE3) explicitly causes the "Cellular Hypercellularity" seen on the slide and the "Contrast Enhancement" on the MRI.The Potential Error: Late fusion misses these cross-modal correlations.The Upgrade: Consider Intermediate Fusion or Cross-Modal Attention. Instead of just gluing vectors together, allow the Pathology features to "attend" to the MRI features. This allows the model to ask: "Does this aggressive-looking cell cluster on the slide correspond to the necrotic region I saw on the MRI?"
3. The Dimensionality "Drowning" EffectWe are combining very different feature scales:Clinical: ~5–10 features (Age, Grade, Size).Genomics: 4 features (GEP score, Ecotype assignment).MRI: ~128–512 features (from the DenseNet encoder).Pathology: 2,560 features (from Virchow-2/ABMIL).The Error: If the Pathology branch provides 2,560 numbers and the Genomics branch only provides 4, the final fully connected layer (the "Head") will be mathematically biased toward the pathology data simply because it has a higher "volume" of parameters.The Fix: Every branch must be projected down to a Uniform Bottleneck Dimension (e.g., 32 features each) before concatenation. This forces each modality to "compete" on a level playing field.
4. Data Silo Alignment (The "Missing Patient" Logic)In Step 3 (Federated Architecture), you will hit the Alignment Problem.The Error: You are assuming every patient in the MSKCC or SARC032 cohort has all four modalities. In reality:Patient A has an MRI and Clinical data, but no pathology slide was digitized.Patient B has a slide and Genomics, but no MRI.The Problem: Standard PyTorch DataLoaders crash if a "None" value is returned.The Fix: You must implement a Robust Multi-Modal DataLoader that can handle "NaN" or "Missing" modalities using the Modality Dropout we discussed. You need to explicitly define a "Null Vector" for each branch so the model can keep training even when the data is fragmented.
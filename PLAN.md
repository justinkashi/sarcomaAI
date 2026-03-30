# OVERALL PLAN 

This plan outlines the transition of the SarcomaAI project from its current 2-branch model (Clinical + Radiology) to a 3-branch multimodal framework (Clinical + Radiology + Pathology) leveraging the **Virchow 2** vision transformer foundation model.

## Preliminary Technical Gaps and Questions

Before initiating the pipeline, the following items must be clarified with the institutional leads at MSKCC and MUHC:

1. **Slide Digitization:** Are the H&E slides for the primary 287-patient cohort already digitized as Whole Slide Images (WSIs) in standard formats (e.g., `.svs`, `.tif`, `.ndpi`)? 


2. **Mapping Integrity:** Is there a validated cross-reference file that links pathology slide IDs to the de-identified Patient IDs currently stored in the **XNAT v1.8** server? 


3. **Compute Infrastructure:** Virchow 2 (ViT-H) contains 632 million parameters. Does the project's AWS stack (G4dn/G5 instances) have the VRAM necessary to load the frozen model and the storage capacity for terabytes of resulting embeddings? 



---

## Phase 1: Data Sourcing and Ingestion (The Pathology Track)

The current SarcomaAI Playbook focuses on DICOM/PACS extraction. This phase establishes the parallel ingestion pipeline for digitized histopathology.

* **Extraction from LIS/VNA:** Digitized slides are typically managed in a Laboratory Information System (LIS) or Vendor Neutral Archive (VNA). We will utilize the hierarchical query logic (Patient -> Study -> Slide) to identify and export matched cases. 


* **Secure Cloud Storage:** Within the AWS architecture outlined in the Playbook, a new `/pathology` prefix will be created in the private S3 bucket to store raw WSIs alongside the existing `/mri` data. 


* **De-identification:** WSIs will be programmatically scrubbed of metadata. We must also implement a cropping step to remove the "label" area of the slides, which often contains physical patient identifiers. 



## Phase 2: Pathology Preprocessing (Tiling & Filtering)

Whole slide images are gigapixel files that cannot be processed by neural networks in their entirety.

* **Tissue Segmentation:** We will implement an HSV-based filter or Otsu thresholding (thresholds of $0.4$, $0.5$) to identify regions of interest (ROI) containing actual tissue while discarding non-informative white background. 


* **Tiling (Patching):** Slides will be partitioned into **$224 \times 224$** pixel patches. Following the Virchow 2 methodology, we will perform extraction at 20x magnification to capture cellular detail and mitotic activity. 


* **Stain Normalization:** To maintain institutional consistency (MSKCC vs. MUHC), we will apply Macenko stain normalization to the patches, mirroring the role of N4 bias correction in the imaging pipeline. 



## Phase 3: Feature Extraction with Virchow 2

This phase treats Virchow 2 as a "frozen" encoder, using its weights to translate morphology into mathematical vectors.

* **Model Loading:** We will load the `paige-ai/Virchow2` (ViT-H/14) weights from HuggingFace.


* **Embedding Configuration:** We will use the authors' recommended **CLS+Mean** configuration. For each tile, the model will concatenate the class token with the mean of the patch tokens, resulting in a **$2,560$-dimension** vector ($1,280 \times 2$). 


* **Vector Storage:** Extracted vectors will be saved as `.h5` files to minimize redundant computation during the subsequent training of the multimodal head. 



## Phase 4: Multiple Instance Learning (MIL) Head

Since each patient has thousands of tile vectors but only one survival outcome, we must aggregate the data.

* **MIL Architecture:** We will integrate an **Attention-based MIL** module into the model's codebase.
* **Learning Importance:** This layer learns to assign high "importance weights" to tiles showing aggressive features (e.g., high nuclear atypia or pleomorphism) while ignoring background or necrotic tissue.
* **Bottleneck Reduction:** The MIL head will "squash" the thousands of tile-level embeddings into a single **$128$-dimension slide vector** to balance the modality weights during fusion. 



## Phase 5: 3-Branch Model Architecture & Training

We will modify the existing **MMNN_STS** code to support the third modality.

* **Subnetwork Integration:** A new `PathologySubnetwork` class will be added to the project's `multimodal_model.py` script.


* **Late Fusion Point:** The fusion layer will now concatenate three distinct vectors before entering the CoxPH prediction head:
* Clinical Vector ($12$-dim) 


* MRI Vector ($12$-dim) 


* Pathology Vector ($128$-dim)


* **Scaling Gradient Blending:** To combat "modality laziness," the loss formula will be updated to handle four heads (Global + 3 Modal) :



$$L_{total} = w_{MM}L_{MM} + w_{MRI}L_{MRI} + w_{clin}L_{clin} + w_{path}L_{path}$$



Weights ($w_i$) will be adjusted every 5 epochs based on the **Overfitting-to-Generalization Ratio (OGR)** of the pathology branch.

JUSTIN NOTE: I am not sure about this section of combatting modality laziness. 



## Phase 6: Federated Deployment (NVFlare)

Training will occur across MSKCC and MUHC sites using **NVIDIA FLARE**.

* **Local Extraction:** Participating sites will run the Virchow 2 extraction and MIL training locally on their own hardware. 


* **Secure Aggregation:** Only updated weights of the MIL head, 3D CNN, and MLP will be transmitted to the central server via the secure gRPC protocol, ensuring raw Whole Slide Images never leave their home institution. 
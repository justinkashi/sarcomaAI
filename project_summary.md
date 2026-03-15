This document serves as a comprehensive technical context bridge for the **SarcomaAI Project**, designed to provide an LLM or Codex with the precise architectural, biological, and pipeline details required to code, reproduce, or supplement the model with genomic data.

# SarcomaAI: Technical Specification & Implementation Guide

## 1. Project Overview

**Goal:** Develop an end-to-end Multimodal Neural Network (MMNN) for soft tissue sarcoma (STS) to predict **overall survival** and **risk of distant metastases**.
**Current Inputs:** 3D MRI (T1 post-contrast & T2 fat-sat) + 11 Clinical Variables.
**Proposed Extension:** Integration of high-dimensional Genomic Data (RNA-seq, CNV, SNV).
**Infrastructure:** Federated Learning (NVFlare) on AWS for multi-institutional training.

---

## 2. Core Model Architecture (Version 0.1)

The architecture is modular, employing parallel subnetworks that merge at a late-fusion layer.

### A. Image Subnetwork (3D CNN)

* **Backbone:** 3D DenseNet-121.
* **Input Shape:** $2 \times 128 \times 128 \times 128$ voxels (2 channels: T1-weighted and T2-weighted sequences).
* **Feature Extraction:** Utilizes "dense blocks" with feed-forward bypass connections between every layer within a block to facilitate feature reuse.
* **Pre-training:** Weights initialized using self-supervised learning on the **BHB-10k** dataset (10,000 neurological MRIs) before fine-tuning on MSKCC sarcoma data. 



### B. Clinical Subnetwork (MLP)

* **Input:** 1D vector of 11 variables: Age, Sex, Tumor Location, Diagnosis, Neoadjuvant Chemotherapy, Tumor Size, Tumor Volume, Tumor Depth, Grade, Metastatic Status at presentation, and Radiotherapy Type. 


* **Components:** Linear layers, **ReLU** activations, **Batch Normalization**, and **Dropout** to prevent overfitting.
* **Output:** A 12-dimension latent vector (embedding).

### C. Fusion & Prediction Head

* **Fusion Method:** Late blending via concatenation of latent vectors from subnetworks.
* **Final Layer:** Fully connected (dense) layers outputting classification and time-to-event predictions.
* **Loss Function:** **Cox Proportional Hazards (CoxPH)** to handle varied follow-up times and right-censored data. 



---

## 3. Proposed Genomic Subnetwork (Extension)

To bridge biological variance, a 3rd branch is added to the architecture.

### A. Genomic Encoder

* **Architecture Options:**
* **1D-CNN:** Effective for capturing local patterns and gene linkage.
* **Pathway-Aware Transformer (e.g., SurvPath):** Maps genes to MSigDB/KEGG pathways using sparse masking to reduce dimensionality while maintaining interpretability. 




* **Latent Space:** The encoder must compress $>20,000$ transcriptomic features into a **128-dimension** latent vector to match the scale of the imaging and clinical branches. 



### B. Critical Genomic Input Signals

| Category | Key Markers / Genes | Significance |
| --- | --- | --- |
| **Transcriptomics** | **CINSARC** (67 genes: *AURKA*, *CDC20*, etc.) | Predicts metastatic relapse better than histological grade. 

 |
| **Copy Number** | *MDM2*, *CDK4*, *JUN*, *RB1* | Diagnostic for DDLPS; correlates with progression. 

 |
| **Mutations** | *TP53*, *ATRX*, *RB1*, *KIT*, *PDGFRA* | Core drivers across sarcoma subtypes. 

 |
| **Immune** | **ICR** (20 genes: *CD8A*, *CTLA4*, *PDCD1*) | Predicts response to immunotherapy. 

 |

---

## 4. Advanced Training: Gradient Blending

Multi-modal training often leads to **"modality laziness,"** where the network over-relies on low-dimensional clinical data.

* **Mechanism:** Monitors the **Overfitting-to-Generalization Ratio (OGR)** of each branch every 5 epochs. 


* **Scaled Loss Formula for 3 Modalities:**

$$L_{total} = w_{MM}L_{MM} + w_{img}L_{img} + w_{clin}L_{clin} + w_{gen}L_{gen}$$


* **Weight Update:** Weights $w_i$ are dynamically adjusted based on validation performance to penalize branches that start to overfit early (highly relevant for the high-dimensional genomic branch). 



---

## 5. Data Preprocessing Pipeline

### Imaging (PyTorch/SimpleITK)

1. **De-identification:** Programmatic removal of PII from DICOM headers using `pydicom`. 


2. **N4 Bias Correction:** Removes intensity non-uniformity caused by magnetic field inhomogeneity. 


3. **Z-score Normalization:** Standardizes voxel values to a distribution with $\mu=0$ and $\sigma=1$ for cross-institutional consistency. 


4. **Segmentation:** Manual/automated ROI extraction focusing on tumor volume.

### Genomics (Bioinformatics)

1. **Normalization:** Convert counts to **TPM** or **FPKM-UQ**. 


2. **Transformation:** Apply **$Log2(x+1)$** to stabilize variance and reduce outlier weight. 


3. **Batch Correction:** Use **ComBat** or Quantile Normalization to remove site-specific sequencing artifacts in federated settings. 



---

## 6. Federated Learning & Cloud Infrastructure

* **Framework:** **NVFlare** (NVIDIA Federated Learning Application Runtime Environment).
* **Protocol:** Central Server (MSKCC) aggregates gradients/weights; Client Servers (MUHC/other sites) train locally on private data.
* **Security:** Mutual TLS (mTLS), Secure Aggregation, and Differential Privacy (DP) filters to prevent gradient leakage of sensitive molecular data.
* **Deployment:** AWS Stack involving **VPC** (Private Subnet), **S3** (Private DICOM/Genomic storage), and **EC2** (G4dn/G5 GPU instances). 



---

## 7. Strategic Public Data Sourcing (TCGA-SARC)

For reproduction and pre-training:

* **Cohort:** 206 adult STS cases across 6 major subtypes (LMS, DDLPS, UPS, etc.).
* **Resources:** Matched genomics (GDC Portal) and pre-surgical CT/MRI (TCIA). 


* **Mapping:** Patient IDs are identical across TCGA (genomics) and TCIA (imaging).

---

## 8. Development Environment Best Practices

* **Language:** Python 3.9+.
* **Libraries:** `torch`, `monai` (for 3D medical imaging), `pydicom`, `SimpleITK`, `nvflare`, `scikit-learn`, `pandas`.
* **Coding Strategy:** Modularize subnetworks as independent `nn.Module` classes. Implement a custom training loop to incorporate the OGR-based weight adjustment logic for Gradient Blending.
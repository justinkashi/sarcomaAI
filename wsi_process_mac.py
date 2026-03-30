#STEP 1 - VIRCHOW2 ON WSI

#DEPENDENCIES
#pip install torch torchvision
#pip install timm
#pip install huggingface_hub
#pip install openslide-python       # WSI reading (brew install openslide first on mac)
#pip install Pillow
#pip install h5py                   # saving tile embeddings
#pip install scikit-image           # Otsu thresholding for tissue segmentation
#pip install numpy

import os
import glob
import timm
import torch
import numpy as np
import h5py
import openslide 
from PIL import Image
from huggingface_hub import login
from timm.data import resolve_data_config
from timm.data.transforms_factory import create_transform
from timm.layers import SwiGLUPacked
from skimage.filters import threshold_otsu
from skimage.color import rgb2hsv


# ── Config ──────────────────────────────────────────────────────────────────
HF_TOKEN = os.environ.get("HF_TOKEN")  # export HF_TOKEN=hf_xxx before running
#WSI_DIR = "/wsi_data"
#OUTPUT_DIR = "/virchow2_output"
TILE_SIZE = 224
TARGET_MPP = 0.5          # 20x magnification
TISSUE_THRESHOLD = 0.50   # keep tiles with >50% tissue
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

# ── 0. Auth & Model Load ───────────────────────────────────────────────────
login(token=HF_TOKEN)

model = timm.create_model(
    "hf-hub:paige-ai/Virchow2",
    pretrained=True,
    mlp_layer=SwiGLUPacked,
    act_layer=torch.nn.SiLU,
)
model = model.eval().to(DEVICE)
transforms = create_transform(**resolve_data_config(model.pretrained_cfg, model=model))


# ── 1. Slide Standardization ───────────────────────────────────────────────
def get_downsample_for_target_mpp(slide, target_mpp=TARGET_MPP):
    """Calculate the downsample factor to reach target_mpp from the slide's native resolution."""
    try:
        native_mpp = float(slide.properties.get(openslide.PROPERTY_NAME_MPP_X, 0))
    except (ValueError, TypeError):
        native_mpp = 0

    if native_mpp <= 0:
        # fallback: assume 40x (0.25 mpp) if metadata missing
        print("  WARNING: no MPP metadata found, assuming 40x (0.25 mpp)")
        native_mpp = 0.25

    downsample = target_mpp / native_mpp
    return downsample, native_mpp


def find_best_level(slide, target_downsample):
    """Pick the openslide level closest to (but not exceeding) the target downsample."""
    level_downsamples = slide.level_downsamples
    best_level = 0
    for i, ds in enumerate(level_downsamples):
        if ds <= target_downsample:
            best_level = i
    return best_level


# ── 2. Tissue Segmentation ─────────────────────────────────────────────────
def create_tissue_mask(slide, seg_downsample=32):
    """Create a binary tissue mask from a low-res thumbnail using Otsu thresholding."""
    dims = slide.dimensions
    thumb_size = (dims[0] // seg_downsample, dims[1] // seg_downsample)
    thumbnail = slide.get_thumbnail(thumb_size).convert("RGB")
    thumb_array = np.array(thumbnail)

    # convert to HSV, threshold on saturation channel
    hsv = rgb2hsv(thumb_array)
    saturation = hsv[:, :, 1]

    try:
        thresh = threshold_otsu(saturation)
    except ValueError:
        thresh = 0.04

    tissue_mask = saturation > thresh
    return tissue_mask, seg_downsample


# ── 3. Tiling & Filtering ──────────────────────────────────────────────────
def extract_tiles(slide, tissue_mask, seg_downsample, target_downsample):
    """Extract 224x224 tiles from tissue regions, return list of (tile_image, x, y) tuples."""
    best_level = find_best_level(slide, target_downsample)
    level_downsample = slide.level_downsamples[best_level]

    # how many level-0 pixels per tile at our read level
    region_size_l0 = int(TILE_SIZE * (target_downsample / 1.0))

    dims = slide.level_dimensions[0]
    tiles = []
    coords = []

    for y in range(0, dims[1], region_size_l0):
        for x in range(0, dims[0], region_size_l0):
            # check tissue mask overlap
            mask_x = x // seg_downsample
            mask_y = y // seg_downsample
            mask_x_end = min(mask_x + region_size_l0 // seg_downsample, tissue_mask.shape[1])
            mask_y_end = min(mask_y + region_size_l0 // seg_downsample, tissue_mask.shape[0])

            if mask_x >= tissue_mask.shape[1] or mask_y >= tissue_mask.shape[0]:
                continue

            region = tissue_mask[mask_y:mask_y_end, mask_x:mask_x_end]
            if region.size == 0:
                continue
            tissue_ratio = region.mean()
            if tissue_ratio < TISSUE_THRESHOLD:
                continue

            # read the tile
            tile = slide.read_region((x, y), best_level, (TILE_SIZE, TILE_SIZE)).convert("RGB")

            # if we read at a different level than target, resize
            if abs(level_downsample - target_downsample) > 0.1:
                actual_size = int(TILE_SIZE * level_downsample / target_downsample)
                tile = slide.read_region((x, y), best_level, (actual_size, actual_size)).convert("RGB")
                tile = tile.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)

            tiles.append(tile)
            coords.append((x, y))

    return tiles, coords


# ── 4. Virchow 2 Feature Extraction ────────────────────────────────────────
@torch.inference_mode()
def extract_embeddings(tiles, batch_size=32):
    """Run tiles through Virchow 2 and return (N, 2560) embeddings."""
    all_embeddings = []

    for i in range(0, len(tiles), batch_size):
        batch_pils = tiles[i : i + batch_size]
        batch_tensors = torch.stack([transforms(img) for img in batch_pils]).to(DEVICE)

        output = model(batch_tensors)  # (B, 261, 1280)

        class_token = output[:, 0]      # (B, 1280)
        patch_tokens = output[:, 5:]    # (B, 256, 1280) — skip register tokens 1-4
        mean_patch = patch_tokens.mean(dim=1)  # (B, 1280)

        embedding = torch.cat([class_token, mean_patch], dim=-1)  # (B, 2560)
        all_embeddings.append(embedding.cpu())

    return torch.cat(all_embeddings, dim=0)  # (N_tiles, 2560)


# ── 5. Save Embeddings ─────────────────────────────────────────────────────
def save_embeddings(embeddings, coords, output_path):
    """Save tile embeddings and coordinates to an h5 file."""
    coords_array = np.array(coords, dtype=np.int64)
    with h5py.File(output_path, "w") as f:
        f.create_dataset("embeddings", data=embeddings.numpy(), compression="gzip")
        f.create_dataset("coords", data=coords_array, compression="gzip")
    print(f"  Saved {embeddings.shape[0]} tile embeddings to {output_path}")


# ── 6. Main Pipeline ───────────────────────────────────────────────────────
def process_slide(wsi_path, output_dir):
    """Full pipeline: slide → tiles → Virchow 2 embeddings → .h5 file."""
    slide_name = os.path.splitext(os.path.basename(wsi_path))[0]
    output_path = os.path.join(output_dir, f"{slide_name}.h5")

    if os.path.exists(output_path):
        print(f"  Skipping {slide_name}, output already exists.")
        return

    print(f"Processing: {slide_name}")

    slide = openslide.OpenSlide(wsi_path)

    # 1. figure out downsampling
    target_downsample, native_mpp = get_downsample_for_target_mpp(slide)
    print(f"  Native MPP: {native_mpp:.4f}, target downsample: {target_downsample:.2f}x")

    # 2. tissue segmentation
    tissue_mask, seg_ds = create_tissue_mask(slide)
    print(f"  Tissue mask: {tissue_mask.shape}, tissue coverage: {tissue_mask.mean():.1%}")

    # 3. tile extraction
    tiles, coords = extract_tiles(slide, tissue_mask, seg_ds, target_downsample)
    print(f"  Extracted {len(tiles)} tiles")

    if len(tiles) == 0:
        print("  WARNING: no tiles extracted, skipping slide.")
        slide.close()
        return

    # 4. Virchow 2 inference
    embeddings = extract_embeddings(tiles)
    print(f"  Embeddings shape: {embeddings.shape}")

    # 5. save
    save_embeddings(embeddings, coords, output_path)
    slide.close()


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    wsi_extensions = ("*.svs", "*.tif", "*.tiff", "*.ndpi", "*.mrxs")
    wsi_files = []
    for ext in wsi_extensions:
        wsi_files.extend(glob.glob(os.path.join(WSI_DIR, ext)))

    print(f"Found {len(wsi_files)} WSI files in {WSI_DIR}")

    for wsi_path in sorted(wsi_files):
        process_slide(wsi_path, OUTPUT_DIR)

    print("Done.")


if __name__ == "__main__":
    main()

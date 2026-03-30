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

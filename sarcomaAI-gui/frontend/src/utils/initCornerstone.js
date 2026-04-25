import { init as csInit } from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';

let initialized = false;

export async function initCornerstone() {
  if (initialized) return;
  await csInit();
  dicomImageLoaderInit({ maxWebWorkers: 0 });
  await csToolsInit();
  addTool(WindowLevelTool);
  addTool(ZoomTool);
  addTool(PanTool);
  addTool(StackScrollTool);
  initialized = true;
}

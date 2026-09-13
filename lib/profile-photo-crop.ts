export type ProfilePhotoCrop = {
  x: number;
  y: number;
  zoom: number;
};

export const DEFAULT_PROFILE_PHOTO_CROP: ProfilePhotoCrop = { x: 0, y: 0, zoom: 1 };
export const PROFILE_PHOTO_OUTPUT_SIZE = 720;

export function clampProfilePhotoCrop(crop: ProfilePhotoCrop): ProfilePhotoCrop {
  return {
    x: Math.max(-1, Math.min(1, crop.x)),
    y: Math.max(-1, Math.min(1, crop.y)),
    zoom: Math.max(1, Math.min(3, crop.zoom)),
  };
}

export function getProfilePhotoCropMetrics({
  sourceWidth,
  sourceHeight,
  viewportSize,
  crop,
}: {
  sourceWidth: number;
  sourceHeight: number;
  viewportSize: number;
  crop: ProfilePhotoCrop;
}) {
  const safeCrop = clampProfilePhotoCrop(crop);
  const coverScale = Math.max(viewportSize / sourceWidth, viewportSize / sourceHeight);
  const scale = coverScale * safeCrop.zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const maxPanX = Math.max(0, (width - viewportSize) / 2);
  const maxPanY = Math.max(0, (height - viewportSize) / 2);

  return {
    width,
    height,
    left: (viewportSize - width) / 2 + safeCrop.x * maxPanX,
    top: (viewportSize - height) / 2 + safeCrop.y * maxPanY,
    maxPanX,
    maxPanY,
  };
}

export async function createProfilePhotoBlob(file: File, crop: ProfilePhotoCrop) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose a photo smaller than 12 MB.");

  const bitmap = await createImageBitmap(file);
  const metrics = getProfilePhotoCropMetrics({
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    viewportSize: PROFILE_PHOTO_OUTPUT_SIZE,
    crop,
  });
  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_PHOTO_OUTPUT_SIZE;
  canvas.height = PROFILE_PHOTO_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare this photo.");
  }
  context.drawImage(bitmap, metrics.left, metrics.top, metrics.width, metrics.height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Could not prepare this photo.")),
    "image/jpeg",
    0.86,
  ));
}

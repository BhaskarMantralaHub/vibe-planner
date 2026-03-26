/* ── Shared image compression utilities ── */

/**
 * Compress an image preserving aspect ratio, scaling to fit within maxDim.
 * Used for gallery photos.
 */
export async function compressGalleryImage(file: File, maxDim = 800): Promise<Blob> {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => { img.onload = resolve; });
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
}

/**
 * Compress an image with center-crop to square, then scale down.
 * Used for player profile photos.
 */
export async function compressPlayerImage(file: File, maxSize = 400): Promise<Blob> {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => { img.onload = resolve; });
  const canvas = document.createElement('canvas');
  // Center-crop to square, then scale down
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const outSize = Math.min(maxSize, side);
  canvas.width = outSize;
  canvas.height = outSize;
  canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, outSize, outSize);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
}

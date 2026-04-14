/* ── Shared image compression utilities ── */

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB pre-compression limit

function loadImage(file: File): Promise<HTMLImageElement> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Max 20MB.`);
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')); };
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Compression produced empty result'));
    }, 'image/jpeg', quality);
  });
}

/**
 * Compress an image preserving aspect ratio, scaling to fit within maxDim.
 * Used for gallery photos.
 */
export async function compressGalleryImage(file: File, maxDim = 800): Promise<Blob> {
  const img = await loadImage(file);
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
  return toBlob(canvas, 0.8);
}

/**
 * Compress a receipt image preserving aspect ratio, scaling to fit within maxDim.
 * Higher resolution + quality than gallery photos — receipt text must stay readable.
 */
export async function compressReceiptImage(file: File, maxDim = 1200): Promise<Blob> {
  const img = await loadImage(file);
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
  return toBlob(canvas, 0.85);
}

/**
 * Compress an image with center-crop to square, then scale down.
 * Used for player profile photos.
 */
export async function compressPlayerImage(file: File, maxSize = 400): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const outSize = Math.min(maxSize, side);
  canvas.width = outSize;
  canvas.height = outSize;
  canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, outSize, outSize);
  URL.revokeObjectURL(img.src);
  return toBlob(canvas, 0.8);
}

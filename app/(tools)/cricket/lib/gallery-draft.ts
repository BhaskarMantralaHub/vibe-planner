export const GALLERY_DRAFT_KEY = 'cricket_gallery_post_draft';
const PHOTOS_MARKER_KEY = 'cricket_gallery_post_draft_photos';
const DB_NAME = 'cricket-gallery-draft';
const STORE = 'photos';

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
};

export const hasGalleryDraft = () => {
  try {
    return !!(sessionStorage.getItem(GALLERY_DRAFT_KEY) || sessionStorage.getItem(PHOTOS_MARKER_KEY));
  } catch { return false; }
};

export const readDraftCaption = () => {
  try { return sessionStorage.getItem(GALLERY_DRAFT_KEY) ?? ''; } catch { return ''; }
};

export const saveDraftCaption = (caption: string) => {
  try {
    if (caption) sessionStorage.setItem(GALLERY_DRAFT_KEY, caption);
    else sessionStorage.removeItem(GALLERY_DRAFT_KEY);
  } catch { /* storage unavailable */ }
};

/** Photos survive a page discard in IndexedDB; the marker keeps drafts per tab. */
export const saveDraftPhotos = async (files: File[]) => {
  try {
    if (files.length === 0) {
      sessionStorage.removeItem(PHOTOS_MARKER_KEY);
      await run('readwrite', (s) => s.delete('files'));
      return;
    }
    sessionStorage.setItem(PHOTOS_MARKER_KEY, '1');
    await run('readwrite', (s) => s.put(files, 'files'));
  } catch (err) {
    console.warn('[gallery] draft photos not saved:', err);
  }
};

export const loadDraftPhotos = async (): Promise<File[]> => {
  try {
    if (!sessionStorage.getItem(PHOTOS_MARKER_KEY)) return [];
    return (await run<File[] | undefined>('readonly', (s) => s.get('files'))) ?? [];
  } catch { return []; }
};

export const clearGalleryDraft = () => {
  try { sessionStorage.removeItem(GALLERY_DRAFT_KEY); } catch { /* storage unavailable */ }
  void saveDraftPhotos([]);
};

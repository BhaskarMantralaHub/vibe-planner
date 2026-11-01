'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { compressReceiptImage } from './image';

export type ReceiptStatus = 'compressing' | 'uploading' | 'done' | 'error';

export interface ReceiptItem {
  id: string;
  name: string;
  preview: string;
  isPdf: boolean;
  status: ReceiptStatus;
  /** App-relative URL once uploaded (cloud mode only). */
  url: string | null;
  path: string | null;
}

type Bucket = 'expense-receipts' | 'split-receipts';

const isPdfFile = (file: File) => file.type === 'application/pdf';
const isValidFile = (file: File) => isPdfFile(file) || file.type.startsWith('image/');

/**
 * Compresses and uploads each receipt the moment it is attached, so the form
 * can hold its submit button until every file is safely in storage. A failed
 * file stays in the list as 'error' (retry or remove) instead of vanishing.
 */
export function useReceiptUploads(bucket: Bucket, maxFiles: number, alreadyAttached = 0) {
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const itemsRef = useRef<ReceiptItem[]>([]);
  const blobsRef = useRef(new Map<string, Blob>());
  const removedRef = useRef(new Set<string>());
  const generationRef = useRef(0);

  const commit = useCallback((next: ReceiptItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback((id: string, changes: Partial<ReceiptItem>) => {
    commit(itemsRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, [commit]);

  const deleteFromStorage = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    getSupabaseClient()?.storage.from(bucket).remove(paths).then(({ error }: { error: unknown }) => {
      if (error) console.error('[cricket] receipt cleanup:', error);
    });
  }, [bucket]);

  const upload = useCallback(async (id: string, blob: Blob, generation: number) => {
    if (!isCloudMode()) { patch(id, { status: 'done' }); return; }

    const supabase = getSupabaseClient();
    const teamId = useAuthStore.getState().currentTeamId;
    if (!supabase || !teamId) { patch(id, { status: 'error' }); return; }

    const pdf = blob.type === 'application/pdf';
    const path = `${teamId}/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`;
    const { error } = await supabase.storage.from(bucket)
      .upload(path, blob, { upsert: true, contentType: pdf ? 'application/pdf' : 'image/jpeg' });

    // Removed or discarded while in flight: don't leave an orphan behind.
    if (generation !== generationRef.current || removedRef.current.has(id)) {
      if (!error) deleteFromStorage([path]);
      return;
    }
    if (error) {
      console.error('[cricket] receipt upload:', error);
      patch(id, { status: 'error' });
      return;
    }
    patch(id, { status: 'done', path, url: `/storage/${bucket}/${path}` });
  }, [bucket, deleteFromStorage, patch]);

  const filesRef = useRef(new Map<string, File>());

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;
    removedRef.current.add(id);
    if (item.preview) URL.revokeObjectURL(item.preview);
    if (item.path) deleteFromStorage([item.path]);
    blobsRef.current.delete(id);
    filesRef.current.delete(id);
    commit(itemsRef.current.filter((it) => it.id !== id));
  }, [commit, deleteFromStorage]);

  const process = useCallback(async (item: ReceiptItem, file: File, generation: number) => {
    let blob = blobsRef.current.get(item.id);
    if (!blob) {
      if (item.isPdf) {
        blob = file;
      } else {
        patch(item.id, { status: 'compressing' });
        try {
          blob = await compressReceiptImage(file);
        } catch (err) {
          if (generation !== generationRef.current || removedRef.current.has(item.id)) return;
          toast.error(err instanceof Error ? err.message : `Failed to compress ${file.name}`);
          remove(item.id);
          return;
        }
      }
      blobsRef.current.set(item.id, blob);
    }
    if (generation !== generationRef.current || removedRef.current.has(item.id)) return;
    patch(item.id, { status: 'uploading' });
    await upload(item.id, blob, generation);
  }, [patch, remove, upload]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const room = maxFiles - alreadyAttached - itemsRef.current.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > picked.length) {
      toast.error(`Max ${maxFiles} receipts. Only adding ${picked.length} more.`);
    }

    const added: { item: ReceiptItem; file: File }[] = [];
    for (const file of picked) {
      if (!isValidFile(file)) { toast.error(`${file.name}: only images and PDFs are supported.`); continue; }
      const pdf = isPdfFile(file);
      added.push({
        file,
        item: {
          id: crypto.randomUUID(), name: file.name, isPdf: pdf, url: null, path: null,
          preview: pdf ? '' : URL.createObjectURL(file),
          status: pdf ? 'uploading' : 'compressing',
        },
      });
    }
    if (added.length === 0) return;

    commit([...itemsRef.current, ...added.map((a) => a.item)]);
    const generation = generationRef.current;
    for (const { item, file } of added) {
      filesRef.current.set(item.id, file);
      void process(item, file, generation);
    }
  }, [alreadyAttached, commit, maxFiles, process]);

  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    const file = filesRef.current.get(id);
    if (!item || !file) return;
    void process(item, file, generationRef.current);
  }, [process]);

  const clear = useCallback((deleteUploaded: boolean) => {
    generationRef.current += 1;
    const current = itemsRef.current;
    current.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); });
    if (deleteUploaded) deleteFromStorage(current.flatMap((it) => (it.path ? [it.path] : [])));
    blobsRef.current.clear();
    filesRef.current.clear();
    removedRef.current.clear();
    commit([]);
  }, [commit, deleteFromStorage]);

  /** After a successful save: the files now belong to the record. */
  const reset = useCallback(() => clear(false), [clear]);
  /** Form cancelled: delete anything already uploaded. */
  const discard = useCallback(() => clear(true), [clear]);

  useEffect(() => () => {
    const orphans = itemsRef.current.flatMap((it) => (it.path ? [it.path] : []));
    itemsRef.current.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); });
    generationRef.current += 1;
    if (orphans.length > 0) getSupabaseClient()?.storage.from(bucket).remove(orphans);
  }, [bucket]);

  const pending = items.filter((it) => it.status === 'compressing' || it.status === 'uploading');
  const failed = items.filter((it) => it.status === 'error');

  return {
    items,
    addFiles,
    remove,
    retry,
    reset,
    discard,
    urls: items.flatMap((it) => (it.url ? [it.url] : [])),
    busy: pending.length > 0,
    pendingCount: pending.length,
    failedCount: failed.length,
    /** "Uploading 2 of 3 receipts…" — null when nothing is in flight. */
    statusText: pending.length > 0
      ? `Uploading ${items.length - pending.length + 1} of ${items.length} receipt${items.length > 1 ? 's' : ''}…`
      : failed.length > 0
        ? `${failed.length} receipt${failed.length > 1 ? 's' : ''} failed — tap to retry or remove`
        : null,
  };
}

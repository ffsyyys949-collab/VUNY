// IndexedDB persistent storage for custom theme video files
const DB_NAME = 'zeio_theme_storage';
const DB_VERSION = 1;
const STORE_NAME = 'custom_videos';

export interface CustomThemeMeta {
  id: string;
  name: string;
  subtitle: string;
  bg?: string;
  hasBlob?: boolean;
  videoUrl?: string; // Persistent server URL or direct URL
  mediaType?: 'video' | 'image';
  createdAt: number;
}

const META_KEY = 'zeio_custom_themes_meta';

function getActiveStorageUid(): string {
  try {
    const raw =
      localStorage.getItem('zeio-user') ||
      localStorage.getItem('ze_user') ||
      localStorage.getItem('vn_currentUser');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = String(parsed?.id || '').trim().toUpperCase();
      if (id) return id;
    }
    const directId = String(localStorage.getItem('ze_id') || '').trim().toUpperCase();
    if (directId) return directId;
  } catch {}
  return 'GUEST';
}

export function getCustomThemesMeta(): CustomThemeMeta[] {
  try {
    const uid = getActiveStorageUid();
    const scopedRaw = localStorage.getItem(`${META_KEY}_${uid}`);
    if (scopedRaw) return JSON.parse(scopedRaw);
    const legacyRaw = localStorage.getItem(META_KEY);
    return legacyRaw ? JSON.parse(legacyRaw) : [];
  } catch {
    return [];
  }
}

export function saveCustomThemesMeta(list: CustomThemeMeta[]) {
  try {
    const uid = getActiveStorageUid();
    const payload = JSON.stringify(list);
    localStorage.setItem(`${META_KEY}_${uid}`, payload);
    localStorage.setItem(META_KEY, payload);
  } catch (e) {
    try {
      const uid = getActiveStorageUid();
      const compact = list.map((item) =>
        item.videoUrl && item.videoUrl.startsWith('data:') && item.hasBlob
          ? { ...item, videoUrl: undefined }
          : item
      );
      const payload = JSON.stringify(compact);
      localStorage.setItem(`${META_KEY}_${uid}`, payload);
      localStorage.setItem(META_KEY, payload);
    } catch {
      console.warn('Failed to save custom themes meta:', e);
    }
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideoBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ id, blob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Error saving video blob to IndexedDB:', e);
    throw e;
  }
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Error fetching video blob:', e);
    return null;
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

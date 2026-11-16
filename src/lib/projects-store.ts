import { toast } from "sonner";
import type { Section } from "@/lib/article-content";

export type Meta = {
  title: string;
  slug: string;
  /** Permanent public id (/wiki/<id>), 11 chars A-Za-z0-9. */
  articleId?: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  hero: string;
};

export type Project = {
  id: string;
  title: string;
  excerpt: string;
  thumbnail: string;
  categories: string[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  meta: Meta;
  sections: Section[];
};

/** Legacy localStorage key (pre-IndexedDB). Read once for migration, then removed. */
export const LEGACY_KEY = "veguto:projects";
const DB_NAME = "veguto";
const DB_VERSION = 1;
const STORE = "projects";
const SAVE_ERROR_TOAST = "veguto-save-error";

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIDB() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/** Copies drafts from the old localStorage key into IndexedDB once, then deletes the key. */
async function migrateLegacy(db: IDBDatabase) {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return; }
  if (!raw) return;
  let list: Project[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed.filter((p) => p && typeof p.id === "string");
  } catch { /* corrupt legacy data: nothing to migrate */ }
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const p of list) {
    // Never overwrite a newer copy already in IndexedDB.
    const existing = (await req(store.get(p.id))) as Project | undefined;
    if (!existing || existing.updatedAt < p.updatedAt) store.put(p);
  }
  await done(tx);
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: "id" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }).then(async (db) => { await migrateLegacy(db); return db; });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

/** Test-only: forget the cached connection so a fresh DB/migration can run. */
export function __resetStoreForTests() {
  dbPromise?.then((db) => db.close()).catch(() => {});
  dbPromise = null;
}

function reportSaveError(error: unknown) {
  console.error("Saving project failed", error);
  const quota = error instanceof DOMException && error.name === "QuotaExceededError";
  toast.error(quota ? "لا توجد مساحة كافية لحفظ المقال في المتصفح." : "تعذر حفظ المقال. تغييراتك ما زالت ظاهرة، حاول مرة أخرى.", { id: SAVE_ERROR_TOAST });
}

export async function loadProjects(): Promise<Project[]> {
  if (!hasIDB()) return [];
  try {
    const db = await openDb();
    const arr = (await req(db.transaction(STORE).objectStore(STORE).getAll())) as Project[];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("Loading projects failed", error);
    return [];
  }
}

/** Replaces the whole list. Returns false (and shows a toast) on failure. */
export async function saveProjects(list: Project[]): Promise<boolean> {
  if (!hasIDB()) return false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const p of list) store.put(p);
    await done(tx);
    return true;
  } catch (error) {
    reportSaveError(error);
    return false;
  }
}

export async function getProject(id: string): Promise<Project | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openDb();
    return ((await req(db.transaction(STORE).objectStore(STORE).get(id))) as Project | undefined) ?? null;
  } catch (error) {
    console.error("Loading project failed", error);
    return null;
  }
}

/** Saves one project. Returns false (and shows a toast) on failure — never throws. */
export async function upsertProject(p: Project): Promise<boolean> {
  if (!hasIDB()) return false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(p);
    await done(tx);
    return true;
  } catch (error) {
    reportSaveError(error);
    return false;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!hasIDB()) return false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await done(tx);
    return true;
  } catch (error) {
    console.error("Deleting project failed", error);
    toast.error("تعذر حذف المشروع.");
    return false;
  }
}

export function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 11-char YouTube-style article id, unique among saved projects. */
export async function newArticleId(): Promise<string> {
  const used = new Set((await loadProjects()).map((p) => p.meta?.articleId));
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(11));
    const id = Array.from(bytes, (b) => ID_CHARS[b % 62]).join("");
    if (!used.has(id)) return id;
  }
}

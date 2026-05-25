export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

const PREFIX = "fwyn:";

const localStorageAdapter: KVStore = {
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
};

export const store: KVStore = localStorageAdapter;

export const TABLES = {
  meta: "meta",
  projects: "projects",
  screens: "screens",
  components: "components",
  variants: "variants",
  references: "references",
  scenes: "scenes",
  thumbnails: "thumbnails",
  workspaces: "workspaces",
  screenVersions: "screen_versions",
  placements: "placements",
  history: "history",
} as const;

export type TableKey = (typeof TABLES)[keyof typeof TABLES];

export async function getTable<T>(key: TableKey): Promise<T[]> {
  return (await store.get<T[]>(key)) ?? [];
}

export async function setTable<T>(key: TableKey, rows: T[]): Promise<void> {
  await store.set(key, rows);
}

const listeners = new Map<TableKey, Set<() => void>>();

export function notify(key: TableKey): void {
  listeners.get(key)?.forEach((fn) => fn());
}

export function subscribe(key: TableKey, fn: () => void): () => void {
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(fn);
  return () => bucket!.delete(fn);
}

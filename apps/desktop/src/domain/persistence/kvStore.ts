export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface RawKVStore {
  getRaw(key: string): Promise<string | null>;
  setRaw(key: string, value: string): Promise<void>;
}

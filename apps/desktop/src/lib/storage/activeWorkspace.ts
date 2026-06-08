import { useEffect, useState } from "react";

/**
 * The currently selected workspace. This is UI/session state, not a persisted
 * records table, so it lives in localStorage with a tiny pub/sub so every
 * consumer (TopBar, Global Components, System Design) stays in sync.
 */
const STORAGE_KEY = "figx.activeWorkspaceId";
const listeners = new Set<() => void>();

function readInitial(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: string | null = readInitial();

export function getActiveWorkspaceId(): string | null {
  return current;
}

export function setActiveWorkspaceId(id: string | null): void {
  current = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
  listeners.forEach((listener) => listener());
}

export function useActiveWorkspaceId(): [
  string | null,
  (id: string | null) => void,
] {
  const [value, setValue] = useState<string | null>(current);
  useEffect(() => {
    const listener = () => setValue(current);
    listeners.add(listener);
    // Sync in case it changed between render and effect.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return [value, setActiveWorkspaceId];
}

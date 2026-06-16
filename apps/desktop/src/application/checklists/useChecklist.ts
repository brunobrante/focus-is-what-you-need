import { useCallback, useEffect, useRef, useState } from "react";

import { newId } from "@/lib/storage/ids";
import type { ChecklistItem } from "@/lib/storage/schema";
import {
  type ChecklistOwner,
  checklistId,
  getChecklist,
  putChecklistItems,
} from "@/lib/storage/repos/checklists.repo";
import { TABLES, subscribe } from "@/lib/storage/store";

export type UseChecklist = {
  items: ChecklistItem[];
  loading: boolean;
  addItem: (label: string) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
};

/**
 * Loads the persisted checklist for a canvas subject (screen or component) and
 * exposes optimistic mutators that write straight through to the record store.
 * Passing `null` (no subject open) yields an empty, read-only list.
 */
export function useChecklist(owner: ChecklistOwner | null): UseChecklist {
  const key = owner ? checklistId(owner) : null;
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Refs so the stable mutator callbacks always read the latest list + owner.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  useEffect(() => {
    const current = ownerRef.current;
    if (!current) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const row = await getChecklist(current);
      if (!cancelled) {
        setItems(row?.items ?? []);
        setLoading(false);
      }
    };
    void load();
    const unsubscribe = subscribe(TABLES.checklists, () => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const commit = useCallback((next: ChecklistItem[]) => {
    setItems(next);
    const current = ownerRef.current;
    if (current) void putChecklistItems(current, next);
  }, []);

  const addItem = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit([...itemsRef.current, { id: newId(), label: trimmed, checked: false }]);
    },
    [commit],
  );

  const toggleItem = useCallback(
    (id: string) => {
      commit(
        itemsRef.current.map((item) =>
          item.id === id ? { ...item, checked: !item.checked } : item,
        ),
      );
    },
    [commit],
  );

  const removeItem = useCallback(
    (id: string) => {
      commit(itemsRef.current.filter((item) => item.id !== id));
    },
    [commit],
  );

  return { items, loading, addItem, toggleItem, removeItem };
}

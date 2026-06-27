import { beforeEach, expect, test } from "bun:test";

import {
  getOrCreateSystemDesignByOwner,
  getSystemDesignByOwner,
  saveSystemDesign,
} from "@/lib/storage/repos/systemDesigns.repo";
import {
  resetRecordStoreCache,
  listTable,
  TABLES,
} from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import type { ColorToken, SystemDesignRow, TokenRow } from "@/lib/storage/schema";

// Flip 2 (Architecture.md): tokens are persisted as one `TokenRow` per token
// in the `tokens` table, never nested on the design row. These guard the repo's
// split-on-write / assemble-on-read bridge.

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

const tokensOf = async (designId: string) =>
  (await listTable<TokenRow>(TABLES.tokens)).filter(
    (row) => row.systemDesignId === designId,
  );

test("a new workspace design persists its seed tokens as rows, not on the design row", async () => {
  const design = await getOrCreateSystemDesignByOwner({
    ownerScope: "workspace",
    ownerId: "ws",
  });

  // The design row itself carries no tokens.
  const rawRow = (await listTable<SystemDesignRow>(TABLES.systemDesigns)).find(
    (row) => row.id === design.id,
  )!;
  expect((rawRow as { tokens?: unknown }).tokens).toBeUndefined();

  // Every seed color exists as its own TokenRow, addressable by the design.
  const rows = await tokensOf(design.id);
  const colorRows = rows.filter((row) => row.category === "colors");
  expect(colorRows.length).toBe(design.tokens.colors.length);
  expect(colorRows.length).toBeGreaterThan(0);
  // The stable ref key lives on the payload; the row id is separate.
  expect(colorRows.every((row) => row.id !== row.token.id)).toBe(true);

  // Read-back assembles the same token set.
  const reread = (await getSystemDesignByOwner("workspace", "ws"))!;
  expect(reread.tokens.colors.map((t) => t.id)).toEqual(
    design.tokens.colors.map((t) => t.id),
  );
});

test("editing one token reuses its row id and leaves the rest untouched", async () => {
  const design = await getOrCreateSystemDesignByOwner({
    ownerScope: "workspace",
    ownerId: "ws",
  });
  const before = await tokensOf(design.id);
  const targetId = design.tokens.colors[0]!.id;
  const targetRowBefore = before.find(
    (row) => row.category === "colors" && row.token.id === targetId,
  )!;

  const nextColors = design.tokens.colors.map((c) =>
    c.id === targetId ? ({ ...c, value: "#000000" } as ColorToken) : c,
  );
  saveSystemDesign({
    ...design,
    tokens: { ...design.tokens, colors: nextColors },
  });

  const after = await tokensOf(design.id);
  // Same number of token rows (an edit, not an add).
  expect(after.length).toBe(before.length);
  const targetRowAfter = after.find(
    (row) => row.category === "colors" && row.token.id === targetId,
  )!;
  // Row id is preserved (envelope/rev continuity); value updated.
  expect(targetRowAfter.id).toBe(targetRowBefore.id);
  expect((targetRowAfter.token as ColorToken).value).toBe("#000000");

  const reread = (await getSystemDesignByOwner("workspace", "ws"))!;
  expect((reread.tokens.colors.find((t) => t.id === targetId)! as ColorToken).value).toBe(
    "#000000",
  );
});

test("removing a token deletes its row", async () => {
  const design = await getOrCreateSystemDesignByOwner({
    ownerScope: "workspace",
    ownerId: "ws",
  });
  const removedId = design.tokens.colors[0]!.id;
  const nextColors = design.tokens.colors.filter((c) => c.id !== removedId);

  saveSystemDesign({
    ...design,
    tokens: { ...design.tokens, colors: nextColors },
  });

  const rows = await tokensOf(design.id);
  expect(
    rows.some((row) => row.category === "colors" && row.token.id === removedId),
  ).toBe(false);

  const reread = (await getSystemDesignByOwner("workspace", "ws"))!;
  expect(reread.tokens.colors.some((t) => t.id === removedId)).toBe(false);
});

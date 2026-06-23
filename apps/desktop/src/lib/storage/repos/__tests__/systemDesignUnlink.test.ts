import { beforeEach, expect, test } from "bun:test";

import {
  applyTokenLinkDecisions,
  getOrCreateSystemDesignByOwner,
  getSystemDesignByOwner,
  listTokenLinkUsages,
  saveSystemDesign,
} from "@/lib/storage/repos/systemDesigns.repo";
import { buildLinkedTokens } from "@/domain/system-design/defaults";
import { resolveSystemDesign } from "@/domain/system-design/resolve";
import { resetRecordStoreCache, replaceTable, TABLES } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import type { SystemDesignRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<SystemDesignRow>(TABLES.systemDesigns, []);
});

// Mirrors what the unlink flow does: flip the master token's `linkable` to false on
// the workspace design (controller.setTokenLinkable).
async function setWorkspaceTokenLinkable(
  workspaceDesignId: string,
  tokenId: string,
  linkable: boolean,
) {
  const row = await getOrCreateSystemDesignByOwner({ ownerScope: "workspace", ownerId: "ws" });
  void workspaceDesignId;
  const colors = (row.tokens.colors as { id: string; linkable?: boolean }[]).map((t) =>
    t.id === tokenId ? { ...t, linkable } : t,
  ) as typeof row.tokens.colors;
  saveSystemDesign({ ...row, tokens: { ...row.tokens, colors } });
}

test("unlinking a workspace token removes it from the project's share picker", async () => {
  const ws = await getOrCreateSystemDesignByOwner({ ownerScope: "workspace", ownerId: "ws" });
  const token = (ws.tokens.colors as { id: string; linkable?: boolean }[])[0]!;
  expect(token.linkable).toBe(true);

  // A project that has NOT linked the token yet — the picker should offer it.
  const project = await getOrCreateSystemDesignByOwner({
    ownerScope: "project",
    ownerId: "p1",
    inheritsFromId: ws.id,
  });
  let resolved = resolveSystemDesign(project, ws);
  expect(resolved.colors.availableShared.map((t) => t.id)).toContain(token.id);

  // Unlink it in the workspace (no project links it → just clear linkable).
  expect(await listTokenLinkUsages("colors", token.id)).toEqual([]);
  await setWorkspaceTokenLinkable(ws.id, token.id, false);

  // Re-read both designs and resolve again — the token must no longer be offered.
  const ws2 = (await getSystemDesignByOwner("workspace", "ws"))!;
  const project2 = (await getSystemDesignByOwner("project", "p1"))!;
  resolved = resolveSystemDesign(project2, ws2);
  expect(resolved.colors.availableShared.map((t) => t.id)).not.toContain(token.id);
});

test("unlinking after a project linked it: copy detaches, token leaves the picker", async () => {
  const ws = await getOrCreateSystemDesignByOwner({ ownerScope: "workspace", ownerId: "ws" });
  const token = (ws.tokens.colors as { id: string; name: string; linkable?: boolean }[])[0]!;

  // Project links the token up front.
  const linked = buildLinkedTokens(ws.id, ws.tokens, new Set([token.id]));
  const project = await getOrCreateSystemDesignByOwner({
    ownerScope: "project",
    ownerId: "p1",
    inheritsFromId: ws.id,
    initialTokens: linked,
  });
  expect(await listTokenLinkUsages("colors", token.id)).toHaveLength(1);

  // Unlink with "copy" for that project, then clear linkable on the master.
  await applyTokenLinkDecisions("colors", token.id, token, [
    { designId: project.id, action: "copy" },
  ]);
  await setWorkspaceTokenLinkable(ws.id, token.id, false);

  const ws2 = (await getSystemDesignByOwner("workspace", "ws"))!;
  const project2 = (await getSystemDesignByOwner("project", "p1"))!;
  const resolved = resolveSystemDesign(project2, ws2);
  expect(resolved.colors.availableShared.map((t) => t.id)).not.toContain(token.id);
});

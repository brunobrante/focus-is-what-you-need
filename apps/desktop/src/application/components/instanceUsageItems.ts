import { getComponent } from "@/lib/storage/repos/components.repo";
import { getScreen } from "@/lib/storage/repos/screens.repo";
import { getVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import { listDetailedInstanceUsages } from "@/lib/storage/repos/scenes.repo";
import type { UnlinkItem } from "@/components/modals/UnlinkComponentModal";

/**
 * Builds one human-readable row per linked-instance occurrence of the given master
 * component(s): "Owner (version) — element name". Shared by the unlink flow and the
 * delete flow, which both let the user decide copy-vs-delete for each placement.
 */
export async function buildInstanceUsageItems(
  componentIds: Set<string>,
): Promise<UnlinkItem[]> {
  const usages = await listDetailedInstanceUsages(componentIds);
  const variantCache = new Map<string, Awaited<ReturnType<typeof getVariant>>>();
  const items: UnlinkItem[] = [];
  for (const usage of usages) {
    let variant = variantCache.get(usage.ownerId);
    if (variant === undefined) {
      variant = await getVariant(usage.ownerId);
      variantCache.set(usage.ownerId, variant);
    }
    let where = "Unknown";
    if (variant) {
      const version = variantVersionLabel(variant);
      if (variant.ownerKind === "component") {
        const owner = await getComponent(variant.ownerId);
        where = `${owner?.name ?? "Component"} (${version})`;
      } else {
        const owner = await getScreen(variant.ownerId);
        where = `${owner?.title ?? "Screen"} (${version})`;
      }
    }
    items.push({
      key: `${usage.ownerId}:${usage.nodeId}`,
      ownerId: usage.ownerId,
      nodeId: usage.nodeId,
      label: `${where} — ${usage.nodeName}`,
    });
  }
  return items;
}

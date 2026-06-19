import { useCallback, useState } from "react";
import type { SavedComponent, ToolReference } from "../types";
import { writeReferenceStackFromComponents } from "../engine/componentModel";
import { writeSavedComponents, removeSavedComponents } from "../engine/storage";

export function useStackPersist({
  components,
  item,
  referenceId,
  componentKey,
  rootComponentId,
  cancelPendingPersist,
}: {
  components: SavedComponent[];
  item: ToolReference;
  referenceId: string | null;
  componentKey: string;
  rootComponentId: string;
  cancelPendingPersist: () => void;
}) {
  const [savingStack, setSavingStack] = useState(false);
  const [stackSaveStatus, setStackSaveStatus] = useState<string | null>(null);

  const persistReferenceStack = useCallback(async () => {
    if (savingStack) return;
    cancelPendingPersist();
    setSavingStack(true);
    setStackSaveStatus(null);
    try {
      if (!referenceId || item.id !== referenceId) {
        writeSavedComponents(componentKey, components);
        setStackSaveStatus("Local state saved");
        return;
      }

      const data = await writeReferenceStackFromComponents({
        components,
        item,
        primaryComponentId: rootComponentId,
        rootComponentId,
      });
      const cutCount = data?.components.length ?? 0;
      const extraStackCount = Math.max(0, (data?.roots?.length ?? 1) - 1);
      setStackSaveStatus(
        data
          ? `${cutCount} ${cutCount === 1 ? "cut" : "cuts"}` +
              (extraStackCount > 0
                ? `, ${extraStackCount} ${extraStackCount === 1 ? "stack" : "stacks"} saved`
                : " saved")
          : "Stack removed",
      );
      removeSavedComponents(componentKey);
    } catch (err) {
      console.error("[tools] stack save failed:", err);
      setStackSaveStatus("Failed to save stack");
    } finally {
      setSavingStack(false);
    }
  }, [cancelPendingPersist, componentKey, components, item, referenceId, rootComponentId, savingStack]);

  return { savingStack, setSavingStack, stackSaveStatus, setStackSaveStatus, persistReferenceStack };
}

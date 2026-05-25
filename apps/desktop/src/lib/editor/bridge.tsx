import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEditor } from "./store";
import type { EditorState } from "./types";

export type EditorBridgeValue = {
  sourceId: string;
  state: EditorState;
  dispatch: ReturnType<typeof useEditor>["dispatch"];
};

type BridgeController = {
  publish: (sourceId: string, value: Omit<EditorBridgeValue, "sourceId">) => void;
  clear: (sourceId: string) => void;
};

const SetterCtx = createContext<BridgeController>({
  publish: () => {},
  clear: () => {},
});
const ValueCtx = createContext<EditorBridgeValue | null>(null);

export function EditorBridgeProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<EditorBridgeValue | null>(null);
  const controller = useMemo<BridgeController>(
    () => ({
      publish: (sourceId, value) => setEditor({ sourceId, ...value }),
      clear: (sourceId) =>
        setEditor((current) => (current?.sourceId === sourceId ? null : current)),
    }),
    [],
  );

  return (
    <SetterCtx.Provider value={controller}>
      <ValueCtx.Provider value={editor}>{children}</ValueCtx.Provider>
    </SetterCtx.Provider>
  );
}

export function useEditorBridge() {
  return useContext(ValueCtx);
}

export function EditorBridgePublisher({
  sourceId = "default",
  active = true,
}: {
  sourceId?: string;
  active?: boolean;
}) {
  const editor = useEditor();
  const bridge = useContext(SetterCtx);

  useEffect(() => {
    if (active) {
      bridge.publish(sourceId, editor);
    } else {
      bridge.clear(sourceId);
    }
  }, [active, bridge, editor, sourceId]);

  useEffect(() => () => bridge.clear(sourceId), [bridge, sourceId]);

  return null;
}

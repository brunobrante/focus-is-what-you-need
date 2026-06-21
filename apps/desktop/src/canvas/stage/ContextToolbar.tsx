import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ALargeSmall, Check, Copy, FoldVertical, Pencil, Rows3, Trash2, X } from "lucide-react";
import {
  deleteElements,
  duplicateElements,
  fitTextElementToContent,
  renameElement,
  setTextElementSizing,
  updateElementStyles,
} from "@/canvas/engine/actions";
import type { CanvasDocument, ElementNode, ElementStyles, Rect } from "@/canvas/engine/types";

// Context-toolbar layout geometry, all in CSS px. Hoisted out of the render body so
// the magic offsets live in one labelled place.
const CONTEXT_TOOLBAR_HEIGHT = 36;
const CONTEXT_TOOLBAR_HALF_WIDTH = 126; // half the default toolbar width
const CONTEXT_TOOLBAR_HALF_WIDTH_RENAME = 150; // wider while the rename field is shown
const CONTEXT_TOOLBAR_GAP = 10; // vertical gap between the toolbar and the size label
const CONTEXT_TOOLBAR_MIN_TOP = 4; // flip the toolbar below the label if it would clip the top edge
const TOOLBAR_VIEWPORT_PAD = 8; // min horizontal gap from the viewport edge

function clampToolbarCenter(
  x: number,
  viewportWidth: number,
  halfWidth = CONTEXT_TOOLBAR_HALF_WIDTH,
): number {
  const halfW = halfWidth;
  const pad = TOOLBAR_VIEWPORT_PAD;
  if (viewportWidth <= (halfW + pad) * 2) return viewportWidth / 2;
  return Math.min(Math.max(x, halfW + pad), viewportWidth - halfW - pad);
}

type ContextToolId =
  | "text-style"
  | "fit-text"
  | "layout-flex"
  | "duplicate"
  | "rename"
  | "delete";

type ContextTool = {
  id: ContextToolId;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
} | "divider";

type ToolbarPanel = "text-style" | "layout" | null;

const FONT_SIZE_OPTIONS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96];

const DEFAULT_FONT_FAMILY = "Inter, system-ui, sans-serif";

const FONT_FAMILY_OPTIONS = [
  { label: "Inter", value: DEFAULT_FONT_FAMILY },
  { label: "Geist", value: "'Geist Variable', system-ui, sans-serif" },
  { label: "System", value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

const JUSTIFY_CONTENT_OPTIONS = [
  { label: "Start", value: "flex-start" },
  { label: "Center", value: "center" },
  { label: "End", value: "flex-end" },
  { label: "Between", value: "space-between" },
];

const ALIGN_ITEMS_OPTIONS = [
  { label: "Stretch", value: "stretch" },
  { label: "Start", value: "flex-start" },
  { label: "Center", value: "center" },
  { label: "End", value: "flex-end" },
];

export type ContextToolbarProps = {
  doc: CanvasDocument;
  selectedId: string | null;
  selectedNode: ElementNode | null;
  selectedIdsKey: string;
  fallbackSelectedIds: string[];
  // Geometry / visibility inputs computed by the parent tooling layer.
  canvasStageActive: boolean;
  isDragging: boolean;
  isEditingText: boolean;
  transformIdsLength: number;
  sizeLabelViewportRect: Rect | null;
  overlayWidth: number;
  editingTextId: string | null;
  // The held modifier that summons the toolbar, tracked by the parent.
  contextToolbarModifierDown: boolean;
  onCommitDocument: (document: CanvasDocument, selectedIds?: string[]) => void;
};

function ContextToolbarImpl(props: ContextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [openPanel, setOpenPanel] = useState<ToolbarPanel>(null);
  const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const doc = props.doc;
  const selectedId = props.selectedId;
  const selectedNode = props.selectedNode;

  useEffect(() => {
    setOpenPanel(null);
    setRenamingElementId(null);
    setRenameDraft("");
  }, [props.selectedIdsKey]);

  useEffect(() => {
    if (!props.editingTextId) return;
    setOpenPanel(null);
    setRenamingElementId(null);
    setRenameDraft("");
  }, [props.editingTextId]);

  useEffect(() => {
    if (!renamingElementId) return;
    const frame = globalThis.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [renamingElementId]);

  useEffect(() => {
    if (!openPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenPanel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openPanel]);

  // The parent clears the open panel on window blur; mirror that here so the held
  // modifier and panel state stay in sync with the rest of the canvas.
  useEffect(() => {
    const onBlur = () => setOpenPanel(null);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const isTextSelection = selectedNode?.type === "text";
  const isBoxLayoutSelection = selectedNode?.type === "rect";
  const isTextFitSelection =
    selectedNode?.type === "text" &&
    (selectedNode.sizing?.width === "fit" || selectedNode.sizing?.height === "fit");
  const isFlexDisplaySelection = selectedNode?.styles.display === "flex";
  const selectedJustifyContent = selectedNode?.styles.justifyContent ?? "flex-start";
  const selectedAlignItems = selectedNode?.styles.alignItems ?? "stretch";
  const selectedFontSize = selectedNode?.type === "text" ? Math.round(selectedNode.styles.fontSize ?? 14) : 14;
  const fontSizeSelectOptions = useMemo(
    () => (
      FONT_SIZE_OPTIONS.includes(selectedFontSize)
        ? FONT_SIZE_OPTIONS
        : [...FONT_SIZE_OPTIONS, selectedFontSize].sort((a, b) => a - b)
    ),
    [selectedFontSize],
  );
  const selectedFontFamily =
    selectedNode?.type === "text" ? selectedNode.styles.fontFamily ?? DEFAULT_FONT_FAMILY : DEFAULT_FONT_FAMILY;
  const fontFamilySelectOptions = useMemo(
    () => (
      FONT_FAMILY_OPTIONS.some((font) => font.value === selectedFontFamily)
        ? FONT_FAMILY_OPTIONS
        : [{ label: "Current", value: selectedFontFamily }, ...FONT_FAMILY_OPTIONS]
    ),
    [selectedFontFamily],
  );
  const isRenamingSelection = renamingElementId !== null && renamingElementId === selectedId;
  const toolbarActive = props.contextToolbarModifierDown || openPanel !== null || isRenamingSelection;

  const contextTools = useMemo<ContextTool[]>(() => {
    const tools: ContextTool[] = [];

    if (isTextSelection) {
      tools.push(
        {
          id: "text-style",
          label: "Text style",
          icon: <ALargeSmall size={15} strokeWidth={1.8} />,
          active: openPanel === "text-style",
        },
        {
          id: "fit-text",
          label: "Fit width and height",
          icon: <FoldVertical size={15} strokeWidth={1.8} />,
          active: isTextFitSelection,
        },
        "divider",
      );
    }

    if (isBoxLayoutSelection) {
      tools.push(
        {
          id: "layout-flex",
          label: "Flex layout",
          icon: <Rows3 size={15} strokeWidth={1.8} />,
          active: isFlexDisplaySelection || openPanel === "layout",
        },
        "divider",
      );
    }

    tools.push(
      {
        id: "rename",
        label: "Rename",
        icon: <Pencil size={14} strokeWidth={1.8} />,
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: <Copy size={14} strokeWidth={1.8} />,
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={14} strokeWidth={1.8} />,
        destructive: true,
      },
    );

    return tools;
  }, [isBoxLayoutSelection, isFlexDisplaySelection, isTextFitSelection, isTextSelection, openPanel]);

  const commitSelectedDocument = (document: CanvasDocument, selectedIds = selectedId ? [selectedId] : props.fallbackSelectedIds) => {
    props.onCommitDocument(document, selectedIds);
  };

  const stopToolbarPointer = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const stopMenuPointer = (event: ReactPointerEvent) => {
    event.stopPropagation();
  };

  const cancelRename = () => {
    setRenamingElementId(null);
    setRenameDraft("");
  };

  const saveRename = () => {
    if (!selectedId || !selectedNode || renamingElementId !== selectedId) {
      cancelRename();
      return;
    }
    const nextName = renameDraft.trim();
    if (nextName && nextName !== selectedNode.name) {
      commitSelectedDocument(renameElement(doc, selectedId, nextName));
    }
    cancelRename();
  };

  const applyLayoutStyle = (style: Partial<ElementStyles>) => {
    if (!selectedId || !selectedNode || !isBoxLayoutSelection) return;
    commitSelectedDocument(updateElementStyles(doc, selectedId, style));
  };

  const setLayoutDisplay = (display: ElementStyles["display"]) => {
    if (display === "flex") {
      applyLayoutStyle({
        display: "flex",
        justifyContent: selectedJustifyContent,
        alignItems: selectedAlignItems,
      });
      return;
    }
    applyLayoutStyle({ display: "block" });
    setOpenPanel(null);
  };

  const handleToolClick = (toolId: ContextToolId) => {
    if (!selectedId || !selectedNode) return;

    if (toolId !== "text-style" && toolId !== "layout-flex") setOpenPanel(null);

    switch (toolId) {
      case "text-style":
        if (selectedNode.type === "text") {
          setOpenPanel((current) => (current === "text-style" ? null : "text-style"));
        }
        return;
      case "fit-text":
        if (selectedNode.type === "text") {
          commitSelectedDocument(
            isTextFitSelection
              ? setTextElementSizing(doc, selectedId, { width: "fixed", height: "fixed" })
              : fitTextElementToContent(doc, selectedId),
          );
        }
        return;
      case "layout-flex":
        if (isBoxLayoutSelection) {
          if (!isFlexDisplaySelection) {
            setLayoutDisplay("flex");
            setOpenPanel("layout");
            return;
          }
          setOpenPanel((current) => (current === "layout" ? null : "layout"));
        }
        return;
      case "duplicate": {
        const duplicated = duplicateElements(doc, [selectedId]);
        props.onCommitDocument(duplicated.document, duplicated.selectedIds);
        return;
      }
      case "rename":
        setRenamingElementId(selectedId);
        setRenameDraft(selectedNode.name);
        return;
      case "delete":
        props.onCommitDocument(deleteElements(doc, [selectedId]), []);
        return;
    }
  };

  const applyTextFontSize = (fontSize: number) => {
    if (!selectedId || selectedNode?.type !== "text") return;
    commitSelectedDocument(updateElementStyles(doc, selectedId, { fontSize }));
    setOpenPanel(null);
  };

  const applyTextFontFamily = (fontFamily: string) => {
    if (!selectedId || selectedNode?.type !== "text") return;
    commitSelectedDocument(updateElementStyles(doc, selectedId, { fontFamily }));
    setOpenPanel(null);
  };

  const position = useMemo(() => {
    if (
      !toolbarActive ||
      props.canvasStageActive ||
      props.isDragging ||
      props.isEditingText ||
      props.transformIdsLength !== 1 ||
      !props.sizeLabelViewportRect
    ) {
      return null;
    }
    const labelRect = props.sizeLabelViewportRect;
    const above = labelRect.y - CONTEXT_TOOLBAR_HEIGHT - CONTEXT_TOOLBAR_GAP;
    return {
      left: clampToolbarCenter(
        labelRect.x + labelRect.width / 2,
        props.overlayWidth,
        isRenamingSelection ? CONTEXT_TOOLBAR_HALF_WIDTH_RENAME : CONTEXT_TOOLBAR_HALF_WIDTH,
      ),
      top:
        above >= CONTEXT_TOOLBAR_MIN_TOP
          ? above
          : labelRect.y + labelRect.height + CONTEXT_TOOLBAR_GAP,
    };
  }, [
    props.overlayWidth,
    isRenamingSelection,
    toolbarActive,
    props.canvasStageActive,
    props.isDragging,
    props.isEditingText,
    props.sizeLabelViewportRect,
    props.transformIdsLength,
  ]);

  // Replay the toolbar's entrance animation when it appears or when it swaps
  // between its normal and rename modes. Previously the subtree was remounted via
  // a stringified-boolean `key` purely to restart a CSS `animation` — which threw
  // away the input's focus/state every toggle. Driving it through the Web
  // Animations API keeps the element (and the rename field's focus) intact.
  const toolbarVisible = position !== null;
  useEffect(() => {
    const el = toolbarRef.current;
    if (!toolbarVisible || !el || typeof el.animate !== "function") return;
    el.animate(
      [
        { opacity: 0, transform: "translateX(-50%) translateY(4px) scale(0.9)" },
        { opacity: 1, transform: "translateX(-50%) translateY(0) scale(1)" },
      ],
      { duration: 110, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [toolbarVisible, isRenamingSelection, props.contextToolbarModifierDown]);

  if (!position) return null;

  return (
    <div
      ref={toolbarRef}
      className={`context-toolbar${isRenamingSelection ? " context-toolbar--rename" : ""}`}
      style={{
        left: position.left,
        top: position.top,
      }}
      onPointerDown={stopToolbarPointer}
      onContextMenu={(event) => event.preventDefault()}
    >
      {isRenamingSelection ? (
        <form
          className="context-toolbar-rename-form"
          onPointerDown={stopMenuPointer}
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            saveRename();
          }}
        >
          <input
            ref={renameInputRef}
            className="context-toolbar-name-input"
            value={renameDraft}
            aria-label="Element name"
            onChange={(event) => setRenameDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancelRename();
              }
            }}
          />
          <div className="context-toolbar-rename-actions">
            <button
              type="submit"
              className="context-toolbar-btn context-toolbar-rename-btn"
              aria-label="Save name"
              title="Save"
            >
              <Check size={14} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="context-toolbar-btn context-toolbar-rename-btn"
              aria-label="Cancel rename"
              title="Cancel"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                cancelRename();
              }}
            >
              <X size={14} strokeWidth={1.9} />
            </button>
          </div>
        </form>
      ) : contextTools.map((tool, i) =>
        tool === "divider" ? (
          <div key={`div-${i}`} className="context-toolbar-divider" aria-hidden />
        ) : (
          <div key={tool.id} className="context-toolbar-tool">
            <button
              type="button"
              className={[
                "context-toolbar-btn",
                tool.active ? "is-active" : "",
                tool.destructive ? "is-danger" : "",
              ].filter(Boolean).join(" ")}
              aria-label={tool.label}
              title={tool.label}
              onPointerDown={stopToolbarPointer}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleToolClick(tool.id);
              }}
            >
              {tool.icon}
            </button>
            {tool.id === "text-style" && openPanel === "text-style" && selectedNode?.type === "text" ? (
              <div
                className="context-toolbar-menu"
                onPointerDown={stopMenuPointer}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="context-toolbar-menu-section">
                  <label className="context-toolbar-menu-label" htmlFor="context-toolbar-font-size">
                    Size
                  </label>
                  <select
                    id="context-toolbar-font-size"
                    className="context-toolbar-select"
                    value={selectedFontSize}
                    onPointerDown={stopMenuPointer}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      applyTextFontSize(Number(event.currentTarget.value));
                    }}
                  >
                    {fontSizeSelectOptions.map((fontSize) => (
                      <option key={fontSize} value={fontSize}>
                        {fontSize}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="context-toolbar-menu-section">
                  <label className="context-toolbar-menu-label" htmlFor="context-toolbar-font-family">
                    Font
                  </label>
                  <select
                    id="context-toolbar-font-family"
                    className="context-toolbar-select"
                    value={selectedFontFamily}
                    onPointerDown={stopMenuPointer}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      applyTextFontFamily(event.currentTarget.value);
                    }}
                  >
                    {fontFamilySelectOptions.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            {tool.id === "layout-flex" && openPanel === "layout" && selectedNode?.type === "rect" ? (
              <div
                className="context-toolbar-menu context-toolbar-menu--layout"
                onPointerDown={stopMenuPointer}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="context-toolbar-menu-section">
                  <label className="context-toolbar-menu-label" htmlFor="context-toolbar-display">
                    Display
                  </label>
                  <select
                    id="context-toolbar-display"
                    className="context-toolbar-select"
                    value={selectedNode.styles.display ?? "block"}
                    onPointerDown={stopMenuPointer}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      setLayoutDisplay(event.currentTarget.value as ElementStyles["display"]);
                    }}
                  >
                    <option value="block">Block</option>
                    <option value="flex">Flex</option>
                  </select>
                </div>
                <div className="context-toolbar-menu-section">
                  <label className="context-toolbar-menu-label" htmlFor="context-toolbar-justify">
                    Horizontal
                  </label>
                  <select
                    id="context-toolbar-justify"
                    className="context-toolbar-select"
                    value={selectedJustifyContent}
                    onPointerDown={stopMenuPointer}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      applyLayoutStyle({
                        display: "flex",
                        justifyContent: event.currentTarget.value,
                      });
                    }}
                  >
                    {JUSTIFY_CONTENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="context-toolbar-menu-section">
                  <label className="context-toolbar-menu-label" htmlFor="context-toolbar-align">
                    Vertical
                  </label>
                  <select
                    id="context-toolbar-align"
                    className="context-toolbar-select"
                    value={selectedAlignItems}
                    onPointerDown={stopMenuPointer}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      applyLayoutStyle({
                        display: "flex",
                        alignItems: event.currentTarget.value,
                      });
                    }}
                  >
                    {ALIGN_ITEMS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

export const ContextToolbar = memo(ContextToolbarImpl);

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ConfirmActionModal, type ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";
import { Modal, ModalBody, ModalHeader } from "@/components/modals/Modal";
import { CardMenuIcons as SharedCardMenuIcons } from "@/components/screen/CardMenu";
import { IconPlus } from "@/components/icons";
import type { SectionState } from "../types";

export function SectionedGrid<T>({
  items,
  sections,
  sectionById,
  onSectionsChange,
  onSectionByIdChange,
  getId,
  gridTemplateColumns,
  itemGap,
  newSectionPrefix,
  renderItem,
  renderAddCard,
  createSectionRequest,
  showCreateSectionButton = true,
}: {
  items: T[];
  sections: SectionState[];
  sectionById: Record<string, string | null>;
  onSectionsChange: Dispatch<SetStateAction<SectionState[]>>;
  onSectionByIdChange: Dispatch<SetStateAction<Record<string, string | null>>>;
  getId: (item: T) => string;
  gridTemplateColumns: string;
  itemGap?: string;
  newSectionPrefix: string;
  renderItem: (
    item: T,
    helpers: { onRequestAssignSection: () => void },
  ) => ReactNode;
  renderAddCard?: () => ReactNode;
  createSectionRequest?: number;
  showCreateSectionButton?: boolean;
}) {
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const sectionConfirmRef = useRef<ConfirmActionModalHandle>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [assignSectionId, setAssignSectionId] = useState<string>("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingScrollSectionId, setPendingScrollSectionId] = useState<string | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const groups = [
    { id: null, name: null },
    ...sections.map((section) => ({ id: section.id, name: section.name })),
  ];

  const openSectionModal = () => {
    setSectionName(`${newSectionPrefix} ${sections.length + 1}`);
    setSectionModalOpen(true);
  };
  const addSection = () => {
    const trimmed = sectionName.trim();
    if (!trimmed) return;
    const section: SectionState = {
      id: `section-${Date.now()}`,
      name: trimmed,
    };
    onSectionsChange((prev) => [...prev, section]);
    setPendingScrollSectionId(section.id);
    setSectionModalOpen(false);
    setSectionName("");
  };
  const assigningItem = assigningItemId
    ? items.find((item) => getId(item) === assigningItemId) ?? null
    : null;
  const activeDragItem = activeDragId
    ? items.find((item) => getId(item) === activeDragId) ?? null
    : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const itemId = String(event.active.id);
    const rawTarget = event.over ? String(event.over.id) : "";
    if (!rawTarget.startsWith("section:")) return;
    const nextSectionId = rawTarget === "section:unassigned" ? null : rawTarget.replace("section:", "");
    onSectionByIdChange((prev) => ({ ...prev, [itemId]: nextSectionId }));
  };

  useEffect(() => {
    if (!createSectionRequest) return;
    openSectionModal();
  }, [createSectionRequest]);

  useEffect(() => {
    if (!pendingScrollSectionId) return;
    const frame = window.requestAnimationFrame(() => {
      sectionRefs.current.get(pendingScrollSectionId)?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      setPendingScrollSectionId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingScrollSectionId, sections]);

  return (
    <div className="flex flex-col gap-7">
      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveDragId(String(event.active.id))}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={handleDragEnd}
      >
        {groups.map((group) => {
          const groupItems = items.filter(
            (item) => (sectionById[getId(item)] ?? null) === group.id,
          );
          const isUncategorized = group.id == null;

          return (
            <section
              key={group.id ?? "uncategorized"}
              ref={(node) => {
                if (!group.id) return;
                if (node) sectionRefs.current.set(group.id, node);
                else sectionRefs.current.delete(group.id);
              }}
              className="scroll-mt-6 flex flex-col gap-3"
            >
              {!isUncategorized ? (
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                  <input
                    value={group.name ?? "Section"}
                    onChange={(e) => {
                      const value = e.target.value;
                      onSectionsChange((prev) =>
                        prev.map((section) =>
                          section.id === group.id ? { ...section, name: value } : section,
                        ),
                      );
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        onSectionsChange((prev) =>
                          prev.map((section) =>
                            section.id === group.id ? { ...section, name: "Section" } : section,
                          ),
                        );
                      }
                    }}
                    className="h-8 min-w-[160px] rounded-md border border-transparent bg-transparent px-1 text-[13px] font-semibold text-[var(--text)] outline-none hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:bg-[var(--surface)]"
                  />
                  <span className="text-[11.5px] text-[var(--text-faint)]">
                    {groupItems.length} {groupItems.length === 1 ? "item" : "itens"}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label="Delete section"
                    onClick={() => {
                      if (!group.id) return;
                      const sectionId = group.id;
                      const sectionName = group.name ?? "Section";
                      sectionConfirmRef.current?.open({
                        title: "Delete section",
                        message: `Section "${sectionName}" will be removed. Items will return to the unsectioned area.`,
                        onConfirm: () => {
                          onSectionsChange((prev) => prev.filter((s) => s.id !== sectionId));
                          onSectionByIdChange((prev) => {
                            const next = { ...prev };
                            for (const key of Object.keys(next)) {
                              if (next[key] === sectionId) next[key] = null;
                            }
                            return next;
                          });
                        },
                      });
                    }}
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] bg-transparent text-[var(--text-faint)] hover:border-[rgba(255,80,80,0.45)] hover:bg-[rgba(255,80,80,0.1)] hover:text-[#ff7373]"
                  >
                    {SharedCardMenuIcons.Trash}
                  </button>
                </div>
              ) : null}

              <SectionDropZone id={`section:${group.id ?? "unassigned"}`}>
                <div
                  className={[
                    "grid rounded-[10px]",
                    itemGap ?? "gap-x-[18px] gap-y-[22px]",
                    !isUncategorized && groupItems.length === 0
                      ? "min-h-[92px] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4"
                      : "",
                  ].join(" ")}
                  style={{ gridTemplateColumns }}
                >
                  {groupItems.map((item) => {
                    const itemId = getId(item);
                    return (
                      <SectionDraggableItem key={itemId} id={itemId}>
                        {renderItem(item, {
                          onRequestAssignSection: () => {
                            setAssigningItemId(itemId);
                            setAssignSectionId(sectionById[itemId] ?? "");
                          },
                        })}
                      </SectionDraggableItem>
                    );
                  })}
                  {!isUncategorized && groupItems.length === 0 ? (
                    <div className="col-span-full grid min-h-[58px] place-items-center text-[12.5px] text-[var(--text-faint)]">
                      Drag cards to this section
                    </div>
                  ) : null}
                  {isUncategorized ? renderAddCard?.() : null}
                </div>
              </SectionDropZone>
            </section>
          );
        })}
        <DragOverlay>
          {activeDragItem ? (
            <div className="pointer-events-none max-w-[260px] rotate-1 rounded-[12px] border border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] p-2 shadow-[var(--shadow-pop)]">
              {renderItem(activeDragItem, { onRequestAssignSection: () => undefined })}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showCreateSectionButton ? (
      <div>
        <button
          type="button"
          onClick={openSectionModal}
          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-3 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
        >
          <IconPlus size={13} strokeWidth={1.8} />
          Nova section
        </button>
      </div>
      ) : null}
      <Modal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        ariaLabel="New section"
      >
        <ModalHeader
          title="New section"
          subtitle="Create a visual category to organize cards."
          onClose={() => setSectionModalOpen(false)}
        />
        <ModalBody>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
              Nome
            </span>
            <input
              autoFocus
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSection();
                }
              }}
              className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setSectionModalOpen(false)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={addSection}
              disabled={!sectionName.trim()}
              className="btn btn-primary"
            >
              Create section
            </button>
          </div>
        </ModalBody>
      </Modal>
      <ConfirmActionModal ref={sectionConfirmRef} />
      <Modal
        open={Boolean(assigningItem)}
        onClose={() => setAssigningItemId(null)}
        ariaLabel="Add to section"
      >
        <ModalHeader
          title="Add to section"
          subtitle="Choose where this card should appear visually."
          onClose={() => setAssigningItemId(null)}
        />
        <ModalBody>
          {sections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              Crie uma section antes de adicionar cards.
            </div>
          ) : (
            <label className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Section
              </span>
              <select
                value={assignSectionId}
                onChange={(e) => setAssignSectionId(e.target.value)}
                className="h-11 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] focus:border-[var(--text)]"
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAssigningItemId(null)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!assigningItem || sections.length === 0}
              onClick={() => {
                if (!assigningItemId) return;
                onSectionByIdChange((prev) => ({
                  ...prev,
                  [assigningItemId]: assignSectionId || null,
                }));
                setAssigningItemId(null);
              }}
              className="btn btn-primary"
            >
              Adicionar
            </button>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}

function SectionDropZone({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded-[12px] ring-1 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg)]" : ""}
    >
      {children}
    </div>
  );
}

function SectionDraggableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab touch-none active:cursor-grabbing"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.32 : 1,
      }}
    >
      {children}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Edit3, ExternalLink, Film, Layers, Trash2, Upload } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem, StackTreeNode } from "../types";
import { formatDateTime, formatDuration, formatSize } from "../lib/utils";
import { DetailList, Section, TagEditor } from "./ui";
import { TabButton, Action, ActionLink } from "./ModalShell";
import { StackTreeRows } from "./StackView";
import { findStackNode, countTreeNodes } from "./stackViewHelpers";

export function DetailPanel({
  item, group, imageGroup = false, groupReferences, groups, looseReferences,
  builderHref,
  stackTree = [], stackLoading = false, selectedStackComponentId = null,
  stackPreviewUrls, showStackView = false, awaitingScreenSelection = false,
  onSelectStackComponent, onIsolateStackComponent,
  onDelete, onNameChange, onDescriptionChange, onTagsChange, onSourceUrlChange, onGroupChange,
  onExtractFrames, onUpload, onEditGroup, onDeleteGroup,
}: {
  item: ReferenceItem | null;
  group: ReferenceGroup | null;
  imageGroup?: boolean;
  groupReferences: ReferenceItem[];
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  builderHref: string | null;
  stackTree?: StackTreeNode[];
  stackLoading?: boolean;
  selectedStackComponentId?: string | null;
  stackPreviewUrls?: Record<string, string>;
  showStackView?: boolean;
  awaitingScreenSelection?: boolean;
  onSelectStackComponent?: (id: string) => void;
  onIsolateStackComponent?: (id: string) => void;
  onDelete: () => void;
  onNameChange: (id: string, name: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: () => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
}) {
  type SideTab = "inspector" | "group";
  const hasStack = Boolean(item?.stack?.enabled);
  const defaultTab: SideTab = !item && group ? "group" : "inspector";
  const [tab, setTab] = useState<SideTab>(defaultTab);
  const hasGroupTab = Boolean(group) || imageGroup;
  const inspectorShowsStack = showStackView && hasStack;
  const showingStackTree = tab === "inspector" && inspectorShowsStack;

  useEffect(() => {
    if (showStackView) setTab("inspector");
  }, [showStackView]);

  const selectedNode = selectedStackComponentId
    ? findStackNode(stackTree, selectedStackComponentId)
    : null;
  const selectedPreviewUrl = selectedStackComponentId && stackPreviewUrls
    ? stackPreviewUrls[selectedStackComponentId]
    : undefined;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
        <TabButton active={tab === "inspector"} onClick={() => setTab("inspector")}>
          Inspector
        </TabButton>
        {hasGroupTab && (
          <TabButton active={tab === "group"} onClick={() => setTab("group")}>
            Group
          </TabButton>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${showingStackTree ? "flex flex-col overflow-hidden" : "overflow-y-auto p-4"}`}>
        {tab === "inspector" && inspectorShowsStack ? (
          <>
            <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
              <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
                <p className="m-0 text-[11.5px] font-semibold text-[var(--text)]">Stack tree</p>
                {stackLoading && stackTree.length === 0 ? (
                  <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">Loading…</p>
                ) : (
                  <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
                    {awaitingScreenSelection
                      ? "Select a screen"
                      : stackTree.length > 0
                      ? `${countTreeNodes(stackTree)} components`
                      : "No data"}
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {awaitingScreenSelection ? (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] text-[var(--text-faint)]">
                    Select a screen to view its stack.
                  </div>
                ) : stackLoading && stackTree.length === 0 ? (
                  <p className="px-2 py-3 text-[11.5px] text-[var(--text-faint)]">Loading stack…</p>
                ) : stackTree.length > 0 ? (
                  stackTree.map((node) => (
                    <StackTreeRows
                      key={node.component.id}
                      node={node}
                      selectedId={selectedStackComponentId}
                      onSelect={(id) => onSelectStackComponent?.(id)}
                      onIsolate={(id) => onIsolateStackComponent?.(id)}
                    />
                  ))
                ) : (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] text-[var(--text-faint)]">
                    No stack data found.
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)]">
              {selectedNode ? (
                <>
                  <div className="flex items-start gap-2.5 p-3">
                    {selectedPreviewUrl && (
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
                        <img
                          src={selectedPreviewUrl}
                          alt={selectedNode.component.name}
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="m-0 truncate text-[12px] font-semibold leading-snug text-[var(--text)]">
                        {selectedNode.component.name}
                      </p>
                      <p className="m-0 mt-1 text-[10.5px] tabular-nums text-[var(--text-faint)]">
                        {Math.round(selectedNode.component.box.w)} × {Math.round(selectedNode.component.box.h)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] px-3 py-2.5">
                    {item?.mediaKind === "image" && builderHref ? (
                      <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
                    ) : null}
                    <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
                  </div>
                </>
              ) : (
                <p className="px-3 py-3 text-[11.5px] text-[var(--text-faint)]">No component selected.</p>
              )}
            </div>
          </>
        ) : tab === "inspector" && item ? (
          <ItemDetails
            item={item}
            groups={groups}
            onDescriptionChange={onDescriptionChange}
            onTagsChange={onTagsChange}
            onSourceUrlChange={onSourceUrlChange}
            onGroupChange={onGroupChange}
          />
        ) : tab === "inspector" ? (
          <p className="text-[12px] text-[var(--text-faint)]">No item selected.</p>
        ) : tab === "group" && group ? (
          <GroupDetails
            group={group}
            references={groupReferences}
            looseReferences={looseReferences}
            onGroupChange={onGroupChange}
          />
        ) : tab === "group" && imageGroup && item ? (
          <ImageGroupDetails item={item} onNameChange={onNameChange} />
        ) : null}
      </div>

      {!showingStackTree && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--border)] p-3">
          {tab === "inspector" && item ? (
            <>
              {item.mediaKind === "image" && builderHref ? (
                <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
              ) : null}
              {item.mediaKind === "video" ? (
                <Action icon={<Film size={12} />} label="Extract frames" onClick={onExtractFrames} />
              ) : null}
              <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
            </>
          ) : tab === "group" && group ? (
            <>
              {builderHref ? (
                <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
              ) : (
                <Action icon={<Layers size={12} />} label="Builder" disabled onClick={() => {}} />
              )}
              <Action icon={<Upload size={12} />} label="Add" onClick={onUpload} />
              <Action icon={<Edit3 size={12} />} label="Edit" onClick={onEditGroup} />
              <Action icon={<Trash2 size={12} />} label="Delete" danger onClick={onDeleteGroup} />
            </>
          ) : tab === "group" && imageGroup && item ? (
            <>
              {builderHref ? (
                <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
              ) : null}
              <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function ItemDetails({
  item, groups, onDescriptionChange, onTagsChange, onSourceUrlChange, onGroupChange,
}: {
  item: ReferenceItem;
  groups: ReferenceGroup[];
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [descDraft, setDescDraft] = useState(item.description ?? "");
  const [urlDraft, setUrlDraft] = useState(item.sourceUrl ?? "");
  const prevIdRef = useRef(item.id);

  useEffect(() => {
    if (prevIdRef.current === item.id) return;
    prevIdRef.current = item.id;
    setDescDraft(item.description ?? "");
    setUrlDraft(item.sourceUrl ?? "");
  }, [item.id, item.description, item.sourceUrl]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="break-words text-[13px] font-semibold leading-[1.4] text-[var(--text)]">
        {item.name}
      </div>

      <Section title="Description">
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => onDescriptionChange(item.id, descDraft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDescDraft(item.description ?? ""); e.currentTarget.blur(); }
          }}
          placeholder="Add a description…"
          rows={3}
          className="w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
      </Section>

      <Section title="Source URL">
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => onSourceUrlChange(item.id, urlDraft)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setUrlDraft(item.sourceUrl ?? ""); e.currentTarget.blur(); }
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
          />
          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </Section>

      <Section title="Tags">
        <TagEditor
          tags={item.tags ?? []}
          onAdd={(tag) => onTagsChange(item.id, [...(item.tags ?? []), tag])}
          onRemove={(tag) => onTagsChange(item.id, (item.tags ?? []).filter((t) => t !== tag))}
          asButton
        />
      </Section>

      <Section title="Group">
        <select
          value={item.groupId ?? ""}
          onChange={(e) => onGroupChange(item.id, e.target.value || null)}
          className="h-[34px] w-full cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]"
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </Section>

      <Section title="Details">
        <DetailList
          items={[
            ["Format", item.type],
            ["Type", item.mediaKind === "video" ? "Video" : "Image"],
            ...(item.w && item.h ? [["Dimensions", `${item.w} × ${item.h}`] as [string, string]] : []),
            ["Size", formatSize(item.size || 0)],
            ...(item.stack?.enabled
              ? [["Stack", `${item.stack.itemCount} ${item.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
              : []),
            ...(item.duration !== undefined ? [["Duration", formatDuration(item.duration)] as [string, string]] : []),
            ["Added", formatDateTime(item.added)],
          ]}
        />
      </Section>
    </div>
  );
}

function GroupDetails({
  group, references, looseReferences, onGroupChange,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  looseReferences: ReferenceItem[];
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [addReferenceId, setAddReferenceId] = useState("");
  const stackCount = references.filter((r) => r.stack?.enabled).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="text-[13px] font-semibold text-[var(--text)]">{group.name}</div>
        {group.description ? (
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-[var(--text-muted)]">{group.description}</p>
        ) : null}
      </div>

      <Section title="Details">
        <DetailList
          items={[
            ["Screens", String(references.length)],
            ["Stacks", String(stackCount)],
            ["Updated", formatDateTime(group.updatedAt)],
            ["ID", group.id, true],
          ]}
        />
      </Section>

      <Section title="Add loose screen">
        <select
          value={addReferenceId}
          disabled={looseReferences.length === 0}
          onChange={(e) => {
            const nextId = e.target.value;
            setAddReferenceId("");
            if (nextId) onGroupChange(nextId, group.id);
          }}
          className="h-[34px] w-full cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <option value="">
            {looseReferences.length === 0 ? "No loose references" : "Choose a screen…"}
          </option>
          {looseReferences.map((r) => (
            <option key={r.id} value={r.id}>
              {r.stack?.enabled ? "Stack – " : ""}{r.name}
            </option>
          ))}
        </select>
      </Section>
    </div>
  );
}

function ImageGroupDetails({
  item, onNameChange,
}: {
  item: ReferenceItem;
  onNameChange: (id: string, name: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(item.name);
  const prevIdRef = useRef(item.id);
  const screenCount = item.stack?.rootCount ?? 1;

  useEffect(() => {
    if (prevIdRef.current === item.id) return;
    prevIdRef.current = item.id;
    setNameDraft(item.name);
  }, [item.id, item.name]);

  return (
    <div className="flex flex-col gap-3.5">
      <Section title="Group name">
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => onNameChange(item.id, nameDraft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setNameDraft(item.name); e.currentTarget.blur(); }
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Group name"
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[13px] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
      </Section>

      <Section title="Details">
        <DetailList
          items={[
            ["Screens", String(screenCount)],
            ["Format", item.type],
            ...(item.w && item.h ? [["Dimensions", `${item.w} × ${item.h}`] as [string, string]] : []),
            ["Size", formatSize(item.size || 0)],
            ...(item.stack?.enabled
              ? [["Stack", `${item.stack.itemCount} ${item.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
              : []),
            ["Added", formatDateTime(item.added)],
          ]}
        />
      </Section>
    </div>
  );
}

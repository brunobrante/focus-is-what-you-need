import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { IconFastEdit, IconLink, IconTrash, IconUnlink } from "@/components/icons";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import { SYSTEM_DESIGN_CATEGORIES, CATEGORY_LABEL } from "@/domain/system-design/defaults";
import type { ResolvedCategory, SourcedToken, TokenSource } from "@/domain/system-design/resolve";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import { CATEGORY_ICON, EmptySlot, SectionBlock, TokenAction } from "@/system-design/shared";
import { AddTokenModal, EditTokenModal } from "@/system-design/modals";
import { useUnlinkToken } from "@/application/system-design/useUnlinkToken";
import type {
  ColorToken,
  GradientToken,
  IconToken,
  ImageToken,
  RadiusToken,
  SpacingToken,
  SystemDesignCategory,
  TypeStyleToken,
} from "@/lib/storage/schema";

type AnyToken = { id: string };

const ADD_LABEL: Record<SystemDesignCategory, string> = {
  colors: "New color",
  gradients: "New gradient",
  typography: "Add style",
  icons: "Add icon",
  spacing: "Add token",
  radius: "Add token",
  images: "Add image",
};

const EMPTY_LABEL: Record<SystemDesignCategory, string> = {
  colors: "No colors yet",
  gradients: "No gradients yet",
  typography: "No type styles yet",
  icons: "No icons yet",
  spacing: "No spacing tokens yet",
  radius: "No radius tokens yet",
  images: "No images yet",
};

export function SystemDesignEditor({
  controller,
  workspaceName,
  category: controlledCategory,
  systemBase,
}: {
  controller: SystemDesignController;
  workspaceName?: string | null;
  category?: SystemDesignCategory;
  systemBase?: string;
}) {
  const [localTab, setLocalTab] = useState<SystemDesignCategory>("colors");
  const tab = controlledCategory ?? localTab;
  const { resolved } = controller;
  const { requestUnlink, requestDelete, modal: unlinkTokenModal } = useUnlinkToken();

  // Toggling linkable ON just sets the flag. Toggling OFF runs the unlink flow:
  // if projects link this token, confirm copy/delete per project before disabling.
  const handleToggleLinkable = (
    category: SystemDesignCategory,
    tokenId: string,
    nextLinkable: boolean,
  ) => {
    if (nextLinkable) {
      controller.setTokenLinkable(category, tokenId, true);
      return;
    }
    const token = (controller.design?.tokens[category] as { id: string }[] | undefined)?.find(
      (t) => t.id === tokenId,
    );
    const disable = () => controller.setTokenLinkable(category, tokenId, false);
    if (!token) {
      disable();
      return;
    }
    void requestUnlink({ category, token, onDisable: disable });
  };

  // Deleting a workspace master token that projects still link runs the same per-project
  // copy/delete flow as unlink, then removes the master. Project-scope tokens (locals and
  // linked instances) just delete in place.
  const handleDeleteToken = (category: SystemDesignCategory, tokenId: string) => {
    const remove = () => controller.deleteToken(category, tokenId);
    if (controller.scope !== "workspace") {
      remove();
      return;
    }
    const token = (controller.design?.tokens[category] as { id: string }[] | undefined)?.find(
      (t) => t.id === tokenId,
    );
    if (!token) {
      remove();
      return;
    }
    void requestDelete({ category, token, onDelete: remove });
  };

  if (!resolved) return null;

  return (
    <>
      <nav role="tablist" className="flex gap-1 border-b border-[var(--border)] px-7">
        {SYSTEM_DESIGN_CATEGORIES.map((category) => {
          const isActive = category === tab;
          const itemClass = [
            "relative inline-flex cursor-pointer items-center gap-1.5 px-3.5 py-3 text-[13px] font-medium tracking-[0.1px]",
            isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
          ].join(" ");
          const inner = (
            <>
              <span className="opacity-75">{CATEGORY_ICON[category]}</span>
              {CATEGORY_LABEL[category]}
              {isActive && <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />}
            </>
          );
          return systemBase ? (
            <Link
              key={category}
              to={`${systemBase}/${category}`}
              role="tab"
              aria-selected={isActive}
              replace
              className={`${itemClass} no-underline`}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={category}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setLocalTab(category)}
              className={`${itemClass} border-0 bg-transparent`}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[1100px] px-7 py-10">
          <TokenSection
            category={tab}
            resolved={resolved[tab]}
            controller={controller}
            workspaceName={workspaceName}
            onToggleLinkable={handleToggleLinkable}
            onDeleteToken={handleDeleteToken}
          />
        </div>
      </main>
      {unlinkTokenModal}
    </>
  );
}

// ─── One category ──────────────────────────────────────────────────────────────

function TokenSection({
  category,
  resolved,
  controller,
  workspaceName,
  onToggleLinkable,
  onDeleteToken,
}: {
  category: SystemDesignCategory;
  resolved: ResolvedCategory;
  controller: SystemDesignController;
  workspaceName?: string | null;
  onToggleLinkable: (
    category: SystemDesignCategory,
    tokenId: string,
    nextLinkable: boolean,
  ) => void;
  onDeleteToken: (category: SystemDesignCategory, tokenId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AnyToken | null>(null);
  const { tokens, hasWorkspace, availableShared } = resolved;

  return (
    <>
      <SectionBlock
        title={CATEGORY_LABEL[category]}
        icon={CATEGORY_ICON[category]}
        actionLabel={ADD_LABEL[category]}
        onAction={() => setAddOpen(true)}
      >
        {hasWorkspace && (
          <p className="-mt-1 text-[11.5px] text-[var(--text-faint)]">
            Showing this project's own tokens and the{" "}
            {workspaceName ? `“${workspaceName}”` : "workspace"} tokens it links. Linked
            tokens are read-only — detach one to edit it as a local copy.
          </p>
        )}
        {tokens.length === 0 ? (
          <EmptySlot label={EMPTY_LABEL[category]} />
        ) : (
          <CategoryGrid
            category={category}
            tokens={tokens}
            scope={controller.scope}
            showSource={hasWorkspace}
            onEdit={(token) => setEditing(token)}
            onDelete={(id) => onDeleteToken(category, id)}
            onDetach={(id) => controller.detachToken(category, id)}
            onToggleLinkable={(id, linkable) => onToggleLinkable(category, id, linkable)}
          />
        )}
      </SectionBlock>

      <AddTokenModal
        category={category}
        open={addOpen}
        hasWorkspace={hasWorkspace}
        availableShared={availableShared as AnyToken[]}
        onClose={() => setAddOpen(false)}
        onCreate={(token) => controller.upsertToken(category, token)}
        onPickShared={(id) => controller.linkToken(category, id)}
      />
      <EditTokenModal
        category={category}
        open={editing !== null}
        token={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(token) => controller.upsertToken(category, token)}
      />
    </>
  );
}

// ─── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: TokenSource }) {
  if (source === "linked") {
    return (
      <span
        title="Linked from workspace — read-only, detach to edit"
        style={{ color: LINKED_INSTANCE_COLOR, borderColor: LINKED_INSTANCE_COLOR }}
        className="inline-flex items-center gap-1 rounded-full border bg-black/60 px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.3px] backdrop-blur"
      >
        <IconLink size={9} />
        Linked
      </span>
    );
  }
  return (
    <span
      title="Project token"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/60 px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.3px] text-[var(--text-faint)] backdrop-blur"
    >
      <span className="h-2 w-2 rounded-[2px] border border-[var(--text-faint)]" />
      Local
    </span>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

function CategoryGrid({
  category,
  tokens,
  scope,
  showSource,
  onEdit,
  onDelete,
  onDetach,
  onToggleLinkable,
}: {
  category: SystemDesignCategory;
  tokens: SourcedToken[];
  scope: SystemDesignController["scope"];
  showSource: boolean;
  onEdit: (token: AnyToken) => void;
  onDelete: (id: string) => void;
  onDetach: (id: string) => void;
  onToggleLinkable: (id: string, linkable: boolean) => void;
}) {
  // The hover actions for one token, by scope and source:
  // - workspace: a linkable toggle + edit + delete.
  // - project / local token: edit + delete.
  // - project / linked instance: detach (make local copy) + remove the link.
  const tokenActions = ({ token, source }: SourcedToken, sz = 11) => {
    if (scope === "workspace") {
      const linkable = (token as { linkable?: boolean }).linkable === true;
      return (
        <>
          <TokenAction
            icon={<IconLink size={sz} />}
            active={linkable}
            title={linkable ? "Linkable — shared to projects" : "Make linkable"}
            onClick={() => onToggleLinkable(token.id, !linkable)}
          />
          <TokenAction icon={<IconFastEdit size={sz} />} onClick={() => onEdit(token)} />
          <TokenAction icon={<IconTrash size={sz} />} danger onClick={() => onDelete(token.id)} />
        </>
      );
    }
    if (source === "linked") {
      return (
        <>
          <TokenAction
            icon={<IconUnlink size={sz} />}
            title="Detach — make a local copy"
            onClick={() => onDetach(token.id)}
          />
          <TokenAction
            icon={<IconTrash size={sz} />}
            danger
            title="Remove link"
            onClick={() => onDelete(token.id)}
          />
        </>
      );
    }
    return (
      <>
        <TokenAction icon={<IconFastEdit size={sz} />} onClick={() => onEdit(token)} />
        <TokenAction icon={<IconTrash size={sz} />} danger onClick={() => onDelete(token.id)} />
      </>
    );
  };
  // Overlay actions for card-style categories (absolute top-right).
  const cardActions = (entry: SourcedToken) => (
    <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
      {tokenActions(entry)}
    </div>
  );
  // Inline actions for list-style categories (trailing on hover).
  const rowActions = (entry: SourcedToken) => (
    <div className="hidden gap-1 group-hover:flex">{tokenActions(entry)}</div>
  );
  const corner = (source: TokenSource) =>
    showSource ? <div className="absolute left-1.5 top-1.5">{<SourceBadge source={source} />}</div> : null;
  // A purple inset ring marks a linked instance — the same accent components use.
  const ringFor = (source: TokenSource): CSSProperties | undefined =>
    source === "linked"
      ? { boxShadow: `inset 0 0 0 1.5px ${LINKED_INSTANCE_COLOR}`, borderColor: "transparent" }
      : undefined;

  if (category === "colors") {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {tokens.map((entry) => {
          const c = entry.token as ColorToken;
          return (
            <div key={c.id} style={ringFor(entry.source)} className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
              <div className="relative h-16 w-full rounded-lg border border-white/10" style={{ background: c.value }}>
                {corner(entry.source)}
                {cardActions(entry)}
              </div>
              <div>
                <div className="text-[12.5px] font-medium text-[var(--text)]">{c.name}</div>
                <div className="font-mono text-[11px] text-[var(--text-faint)]">{c.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "gradients") {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {tokens.map((entry) => {
          const g = entry.token as GradientToken;
          return (
            <div key={g.id} style={ringFor(entry.source)} className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
              <div className="relative h-16 w-full rounded-lg border border-white/10" style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}>
                {corner(entry.source)}
                {cardActions(entry)}
              </div>
              <div className="text-[12.5px] font-medium text-[var(--text)]">{g.name}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "typography") {
    return (
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {tokens.map((entry) => {
          const t = entry.token as TypeStyleToken;
          return (
            <div key={t.id} style={ringFor(entry.source)} className="group -mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-[var(--surface)]">
              {showSource && <SourceBadge source={entry.source} />}
              <div className="w-28 shrink-0">
                <div className="text-[12.5px] font-medium text-[var(--text)]">{t.name}</div>
                <div className="text-[11px] text-[var(--text-faint)]">{t.family} · {t.weight} · {t.size}</div>
              </div>
              <div className="min-w-0 flex-1 truncate text-[var(--text)]" style={{ fontFamily: t.family, fontWeight: t.weight, fontSize: t.size, lineHeight: "1.3" }}>
                {t.sample}
              </div>
              {rowActions(entry)}
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "icons") {
    return (
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
        {tokens.map((entry) => {
          const ic = entry.token as IconToken;
          return (
            <div key={ic.id} style={ringFor(entry.source)} className="group relative grid aspect-square gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]">
              {corner(entry.source)}
              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                {tokenActions(entry, 10)}
              </div>
              <div className="grid place-items-center text-[22px]">{ic.glyph}</div>
              <div className="truncate text-center text-[11px] text-[var(--text-muted)]">{ic.name}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "spacing") {
    return (
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {tokens.map((entry) => {
          const s = entry.token as SpacingToken;
          return (
            <div key={s.id} style={ringFor(entry.source)} className="group -mx-3 flex items-center gap-5 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)]">
              {showSource && <SourceBadge source={entry.source} />}
              <span className="w-14 shrink-0 font-mono text-[12px] text-[var(--text-faint)]">{s.name}</span>
              <div className="shrink-0 rounded-[2px] bg-[var(--text-muted)]" style={{ width: Math.min(s.value * 2, 200), height: 10 }} />
              <span className="font-mono text-[12px] text-[var(--text-muted)]">{s.value}px</span>
              <div className="ml-auto">{rowActions(entry)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "radius") {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
        {tokens.map((entry) => {
          const r = entry.token as RadiusToken;
          return (
            <div key={r.id} style={ringFor(entry.source)} className="group flex flex-col gap-3 rounded-xl border border-[var(--border)] p-3.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
              <div className="relative">
                <div className="h-14 w-full border border-[var(--border-strong)] bg-[var(--surface-hover)]" style={{ borderRadius: Math.min(r.value, 28) }} />
                {corner(entry.source)}
                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                  {tokenActions(entry, 10)}
                </div>
              </div>
              <div>
                <div className="text-[12.5px] font-medium text-[var(--text)]">{r.name}</div>
                <div className="font-mono text-[11px] text-[var(--text-faint)]">{r.value === 9999 ? "9999px" : `${r.value}px`}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // images
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
      {tokens.map((entry) => {
        const image = entry.token as ImageToken;
        return (
          <div key={image.id} style={ringFor(entry.source)} className="group relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]">
            {corner(entry.source)}
            {cardActions(entry)}
            <img src={image.previewUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <span className="truncate text-[12px] text-[var(--text)]">{image.name}</span>
              <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{image.format}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

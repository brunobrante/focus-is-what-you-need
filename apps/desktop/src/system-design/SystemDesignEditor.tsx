import { useState } from "react";
import { IconFastEdit, IconTrash } from "@/components/icons";
import { SYSTEM_DESIGN_CATEGORIES, CATEGORY_LABEL } from "@/domain/system-design/defaults";
import type { ResolvedCategory, SourcedToken, TokenSource } from "@/domain/system-design/resolve";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import { CATEGORY_ICON, EmptySlot, SectionBlock, TokenAction } from "@/system-design/shared";
import { AddTokenModal, EditTokenModal } from "@/system-design/modals";
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
}: {
  controller: SystemDesignController;
  workspaceName?: string | null;
}) {
  const [tab, setTab] = useState<SystemDesignCategory>("colors");
  const { resolved } = controller;

  if (!resolved) return null;

  return (
    <>
      <nav role="tablist" className="flex gap-1 border-b border-[var(--border)] px-7">
        {SYSTEM_DESIGN_CATEGORIES.map((category) => {
          const isActive = category === tab;
          return (
            <button
              key={category}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setTab(category)}
              className={[
                "relative inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3.5 py-3 text-[13px] font-medium tracking-[0.1px]",
                isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              <span className="opacity-75">{CATEGORY_ICON[category]}</span>
              {CATEGORY_LABEL[category]}
              {isActive && <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />}
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
          />
        </div>
      </main>
    </>
  );
}

// ─── One category ──────────────────────────────────────────────────────────────

function TokenSection({
  category,
  resolved,
  controller,
  workspaceName,
}: {
  category: SystemDesignCategory;
  resolved: ResolvedCategory;
  controller: SystemDesignController;
  workspaceName?: string | null;
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
            Showing {workspaceName ? `“${workspaceName}”` : "workspace"} tokens and this
            project's own. Deleting a shared token removes it from the project only — re-add
            it from “Add”.
          </p>
        )}
        {tokens.length === 0 ? (
          <EmptySlot label={EMPTY_LABEL[category]} />
        ) : (
          <CategoryGrid
            category={category}
            tokens={tokens}
            showSource={hasWorkspace}
            onEdit={(token) => setEditing(token)}
            onDelete={(id, source) => controller.deleteToken(category, id, source)}
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
        onPickShared={(id) => controller.reAddShared(category, id)}
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
  if (source === "workspace") {
    return (
      <span
        title="Shared from workspace"
        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-black/60 px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.3px] text-[var(--text-muted)] backdrop-blur"
      >
        <span className="h-2 w-2 rounded-[2px] bg-[var(--text)]" />
        WS
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
  showSource,
  onEdit,
  onDelete,
}: {
  category: SystemDesignCategory;
  tokens: SourcedToken[];
  showSource: boolean;
  onEdit: (token: AnyToken) => void;
  onDelete: (id: string, source: TokenSource) => void;
}) {
  // Overlay actions for card-style categories (absolute top-right).
  const cardActions = ({ token, source }: SourcedToken) => (
    <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
      {source === "project" && <TokenAction icon={<IconFastEdit size={11} />} onClick={() => onEdit(token)} />}
      <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDelete(token.id, source)} />
    </div>
  );
  // Inline actions for list-style categories (trailing on hover).
  const rowActions = ({ token, source }: SourcedToken) => (
    <div className="hidden gap-1 group-hover:flex">
      {source === "project" && <TokenAction icon={<IconFastEdit size={11} />} onClick={() => onEdit(token)} />}
      <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDelete(token.id, source)} />
    </div>
  );
  const corner = (source: TokenSource) =>
    showSource ? <div className="absolute left-1.5 top-1.5">{<SourceBadge source={source} />}</div> : null;

  if (category === "colors") {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {tokens.map((entry) => {
          const c = entry.token as ColorToken;
          return (
            <div key={c.id} className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
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
            <div key={g.id} className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
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
            <div key={t.id} className="group -mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-[var(--surface)]">
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
            <div key={ic.id} className="group relative grid aspect-square gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]">
              {corner(entry.source)}
              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                {entry.source === "project" && <TokenAction icon={<IconFastEdit size={10} />} onClick={() => onEdit(ic)} />}
                <TokenAction icon={<IconTrash size={10} />} danger onClick={() => onDelete(ic.id, entry.source)} />
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
            <div key={s.id} className="group -mx-3 flex items-center gap-5 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)]">
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
            <div key={r.id} className="group flex flex-col gap-3 rounded-xl border border-[var(--border)] p-3.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
              <div className="relative">
                <div className="h-14 w-full border border-[var(--border-strong)] bg-[var(--surface-hover)]" style={{ borderRadius: Math.min(r.value, 28) }} />
                {corner(entry.source)}
                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                  {entry.source === "project" && <TokenAction icon={<IconFastEdit size={10} />} onClick={() => onEdit(r)} />}
                  <TokenAction icon={<IconTrash size={10} />} danger onClick={() => onDelete(r.id, entry.source)} />
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
          <div key={image.id} className="group relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]">
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

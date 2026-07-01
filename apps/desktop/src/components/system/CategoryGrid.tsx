import { type CSSProperties } from "react";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import { IconFastEdit, IconLink, IconOpenCanvas, IconTrash, IconUnlink } from "@/components/icons";
import { TokenAction } from "@/system-design/shared";
import { SourceBadge } from "./SourceBadge";
import { IconGlyph } from "./IconGlyph";
import type { SourcedToken, TokenSource } from "@/domain/system-design/resolve";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
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

export type AnyToken = { id: string };

export function CategoryGrid({
  category,
  tokens,
  scope,
  showSource,
  onEdit,
  onDelete,
  onDetach,
  onToggleLinkable,
  onEditInCanvas,
}: {
  category: SystemDesignCategory;
  tokens: SourcedToken[];
  scope: SystemDesignController["scope"];
  showSource: boolean;
  onEdit: (token: AnyToken) => void;
  onDelete: (id: string) => void;
  onDetach: (id: string) => void;
  onToggleLinkable: (id: string, linkable: boolean) => void;
  /** Icons only: open the token's editable vector art on the canvas. */
  onEditInCanvas?: (token: IconToken) => void;
}) {
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

  const cardActions = (entry: SourcedToken) => (
    <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
      {tokenActions(entry)}
    </div>
  );

  const rowActions = (entry: SourcedToken) => (
    <div className="hidden gap-1 group-hover:flex">{tokenActions(entry)}</div>
  );

  const corner = (source: TokenSource) =>
    showSource ? <div className="absolute left-1.5 top-1.5">{<SourceBadge source={source} />}</div> : null;

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
                {onEditInCanvas && entry.source !== "linked" && (
                  <TokenAction icon={<IconOpenCanvas size={10} />} title="Edit in canvas" onClick={() => onEditInCanvas(ic)} />
                )}
                {tokenActions(entry, 10)}
              </div>
              <div className="grid place-items-center"><IconGlyph icon={ic} size={22} /></div>
              <div className="truncate text-center text-[11px] text-[var(--text-muted)]">{ic.name}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (category === "spacing") {
    return (
      <div className="flex flex-col gap-2">
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

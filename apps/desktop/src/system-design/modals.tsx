import { useEffect, useState, type ReactNode } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/modals/Modal";
import { readFileAsDataUrl, fileFormatLabel } from "@/lib/utils";
import { newTokenId } from "@/application/system-design/useSystemDesign";
import { CATEGORY_LABEL } from "@/domain/system-design/defaults";
import { Field, inputCls } from "@/system-design/shared";
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

// ─── Token forms (fields + footer, no Modal chrome) ───────────────────────────

type FormProps<T> = {
  token?: T;
  onSave: (token: T) => void;
  onCancel: () => void;
};

function FormFooter({
  onCancel,
  onSave,
  label,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn btn-ghost">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={disabled} className="btn btn-primary">
        {label}
      </button>
    </div>
  );
}

function ColorForm({ token, onSave, onCancel }: FormProps<ColorToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [value, setValue] = useState(token?.value ?? "#5EA2FF");
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Primary" />
      </Field>
      <Field label="Color">
        <div className="flex items-center gap-3">
          <input type="color" value={value} onChange={(e) => setValue(e.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
          <input value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} flex-1 font-mono uppercase`} placeholder="#5EA2FF" />
        </div>
      </Field>
      <div className="h-24 w-full rounded-xl border border-white/10" style={{ background: value }} />
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || "Custom", value })} label="Save color" />
    </div>
  );
}

function GradientForm({ token, onSave, onCancel }: FormProps<GradientToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [from, setFrom] = useState(token?.from ?? "#5B6CFF");
  const [to, setTo] = useState(token?.to ?? "#FF6B6B");
  const [angle, setAngle] = useState(token?.angle ?? 135);
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Hero gradient" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <div className="flex items-center gap-2">
            <input type="color" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 w-12 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
            <input value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} flex-1 font-mono uppercase`} />
          </div>
        </Field>
        <Field label="To">
          <div className="flex items-center gap-2">
            <input type="color" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 w-12 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
            <input value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} flex-1 font-mono uppercase`} />
          </div>
        </Field>
      </div>
      <Field label={`Angle — ${angle}°`}>
        <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full" />
      </Field>
      <div className="h-20 w-full rounded-xl border border-white/10" style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }} />
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || "Gradient", from, to, angle })} label="Save gradient" />
    </div>
  );
}

function TypeForm({ token, onSave, onCancel }: FormProps<TypeStyleToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [family, setFamily] = useState(token?.family ?? "Inter");
  const [weight, setWeight] = useState(token?.weight ?? "400");
  const [size, setSize] = useState(token?.size ?? "14px");
  const [sample, setSample] = useState(token?.sample ?? "The quick brown fox");
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Heading 1" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Family">
          <input value={family} onChange={(e) => setFamily(e.target.value)} className={inputCls} placeholder="Inter" />
        </Field>
        <Field label="Weight">
          <input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} placeholder="400" />
        </Field>
        <Field label="Size">
          <input value={size} onChange={(e) => setSize(e.target.value)} className={inputCls} placeholder="14px" />
        </Field>
      </div>
      <Field label="Sample text">
        <input value={sample} onChange={(e) => setSample(e.target.value)} className={inputCls} placeholder="The quick brown fox" />
      </Field>
      <div className="min-h-[56px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)]" style={{ fontFamily: family, fontWeight: weight, fontSize: size, lineHeight: "1.3" }}>
        {sample || "Preview"}
      </div>
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || "Style", family, weight, size, sample })} label="Save style" />
    </div>
  );
}

function IconForm({ token, onSave, onCancel }: FormProps<IconToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [glyph, setGlyph] = useState(token?.glyph ?? "");
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Bell" />
      </Field>
      <Field label="Glyph or emoji">
        <input value={glyph} onChange={(e) => setGlyph(e.target.value)} className={`${inputCls} text-[22px]`} placeholder="🔔" maxLength={4} />
      </Field>
      {glyph && (
        <div className="grid h-20 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[40px]">{glyph}</div>
      )}
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || "Icon", glyph })} label="Save icon" />
    </div>
  );
}

function SpacingForm({ token, onSave, onCancel }: FormProps<SpacingToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [value, setValue] = useState(token?.value ?? 16);
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. lg" />
      </Field>
      <Field label={`Value — ${value}px`}>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={256} value={value} onChange={(e) => setValue(Number(e.target.value))} className="flex-1" />
          <input type="number" min={1} max={512} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-11 w-24 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" />
        </div>
      </Field>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="shrink-0 rounded-[2px] bg-[var(--text-muted)]" style={{ width: Math.min(value * 2, 400), height: 12 }} />
        <span className="font-mono text-[12px] text-[var(--text-muted)]">{value}px</span>
      </div>
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || `${value}px`, value })} label="Save token" />
    </div>
  );
}

function RadiusForm({ token, onSave, onCancel }: FormProps<RadiusToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const initialFull = token ? token.value === 9999 : false;
  const [value, setValue] = useState(initialFull ? 8 : token?.value ?? 8);
  const [isFull, setIsFull] = useState(initialFull);
  const effectiveValue = isFull ? 9999 : value;
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. md" />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-muted)]">
        <input type="checkbox" checked={isFull} onChange={(e) => setIsFull(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--text)]" />
        Full / pill (9999px)
      </label>
      {!isFull && (
        <Field label={`Value — ${value}px`}>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={64} value={value} onChange={(e) => setValue(Number(e.target.value))} className="flex-1" />
            <input type="number" min={0} max={256} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-11 w-24 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" />
          </div>
        </Field>
      )}
      <div className="h-20 w-full border border-[var(--border-strong)] bg-[var(--surface)]" style={{ borderRadius: Math.min(effectiveValue, 40) }} />
      <FormFooter onCancel={onCancel} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || `${effectiveValue}px`, value: effectiveValue })} label="Save token" />
    </div>
  );
}

function ImageForm({ token, onSave, onCancel }: FormProps<ImageToken>) {
  const [name, setName] = useState(token?.name ?? "");
  const [previewUrl, setPreviewUrl] = useState(token?.previewUrl ?? "");
  const [format, setFormat] = useState(token?.format ?? "PNG");
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <label className="grid min-h-[220px] cursor-pointer place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--bg)] p-4 text-center transition-colors hover:border-[var(--text)]">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void (async () => {
              setPreviewUrl(await readFileAsDataUrl(file));
              setFormat(fileFormatLabel(file.name));
              if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
            })();
          }}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="" className="max-h-[220px] rounded-[10px] object-contain" />
        ) : (
          <div className="max-w-[240px] text-[12px] leading-[1.6] text-[var(--text-muted)]">Click to select an image from your disk.</div>
        )}
      </label>
      <FormFooter onCancel={onCancel} disabled={!previewUrl} onSave={() => onSave({ id: token?.id ?? newTokenId(), name: name.trim() || "Asset", previewUrl, format })} label="Save image" />
    </div>
  );
}

function TokenForm({
  category,
  token,
  onSave,
  onCancel,
}: {
  category: SystemDesignCategory;
  token?: AnyToken;
  onSave: (token: AnyToken) => void;
  onCancel: () => void;
}) {
  switch (category) {
    case "colors":
      return <ColorForm token={token as ColorToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "gradients":
      return <GradientForm token={token as GradientToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "typography":
      return <TypeForm token={token as TypeStyleToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "icons":
      return <IconForm token={token as IconToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "spacing":
      return <SpacingForm token={token as SpacingToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "radius":
      return <RadiusForm token={token as RadiusToken | undefined} onSave={onSave} onCancel={onCancel} />;
    case "images":
      return <ImageForm token={token as ImageToken | undefined} onSave={onSave} onCancel={onCancel} />;
  }
}

// ─── Token preview chip (used by the workspace picker) ────────────────────────

function TokenPreview({ category, token }: { category: SystemDesignCategory; token: AnyToken }) {
  if (category === "colors") {
    const c = token as ColorToken;
    return (
      <>
        <span className="h-8 w-8 shrink-0 rounded-md border border-white/10" style={{ background: c.value }} />
        <PreviewLabel title={c.name} subtitle={c.value} mono />
      </>
    );
  }
  if (category === "gradients") {
    const g = token as GradientToken;
    return (
      <>
        <span className="h-8 w-8 shrink-0 rounded-md border border-white/10" style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }} />
        <PreviewLabel title={g.name} subtitle={`${g.angle}°`} />
      </>
    );
  }
  if (category === "typography") {
    const t = token as TypeStyleToken;
    return (
      <>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[14px]" style={{ fontFamily: t.family, fontWeight: t.weight }}>Aa</span>
        <PreviewLabel title={t.name} subtitle={`${t.family} · ${t.weight} · ${t.size}`} />
      </>
    );
  }
  if (category === "icons") {
    const ic = token as IconToken;
    return (
      <>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[18px]">{ic.glyph}</span>
        <PreviewLabel title={ic.name} />
      </>
    );
  }
  if (category === "spacing") {
    const s = token as SpacingToken;
    return (
      <>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border)]">
          <span className="rounded-[2px] bg-[var(--text-muted)]" style={{ width: Math.min(s.value, 22), height: 6 }} />
        </span>
        <PreviewLabel title={s.name} subtitle={`${s.value}px`} mono />
      </>
    );
  }
  if (category === "radius") {
    const r = token as RadiusToken;
    return (
      <>
        <span className="h-8 w-8 shrink-0 border border-[var(--border-strong)] bg-[var(--surface-hover)]" style={{ borderRadius: Math.min(r.value, 16) }} />
        <PreviewLabel title={r.name} subtitle={r.value === 9999 ? "9999px" : `${r.value}px`} mono />
      </>
    );
  }
  const img = token as ImageToken;
  return (
    <>
      <img src={img.previewUrl} alt="" className="h-8 w-8 shrink-0 rounded-md border border-[var(--border)] object-cover" />
      <PreviewLabel title={img.name} subtitle={img.format} />
    </>
  );
}

function PreviewLabel({ title, subtitle, mono }: { title: string; subtitle?: string; mono?: boolean }) {
  return (
    <div className="min-w-0 text-left">
      <div className="truncate text-[12.5px] font-medium text-[var(--text)]">{title}</div>
      {subtitle && (
        <div className={`truncate text-[11px] text-[var(--text-faint)] ${mono ? "font-mono" : ""}`}>{subtitle}</div>
      )}
    </div>
  );
}

// ─── Add / Edit modals ────────────────────────────────────────────────────────

type AddTab = "create" | "workspace";

export function AddTokenModal({
  category,
  open,
  hasWorkspace,
  availableShared,
  onClose,
  onCreate,
  onPickShared,
}: {
  category: SystemDesignCategory;
  open: boolean;
  hasWorkspace: boolean;
  availableShared: AnyToken[];
  onClose: () => void;
  onCreate: (token: AnyToken) => void;
  onPickShared: (id: string) => void;
}) {
  const [tab, setTab] = useState<AddTab>("create");
  useEffect(() => {
    if (open) setTab("create");
  }, [open]);

  const label = CATEGORY_LABEL[category].replace(/s$/, "").toLowerCase();

  return (
    <Modal open={open} onClose={onClose} ariaLabel={`Add ${label}`}>
      <ModalHeader title={`Add ${label}`} subtitle="Create a new token or link one from the workspace." onClose={onClose} />
      {hasWorkspace && (
        <div className="flex gap-1 border-b border-[var(--border)] px-5">
          <ModalTab active={tab === "create"} onClick={() => setTab("create")}>Create new</ModalTab>
          <ModalTab active={tab === "workspace"} onClick={() => setTab("workspace")}>
            From workspace{availableShared.length > 0 ? ` (${availableShared.length})` : ""}
          </ModalTab>
        </div>
      )}
      <ModalBody>
        {open && (tab === "create" || !hasWorkspace) ? (
          <TokenForm
            category={category}
            onSave={(token) => {
              onCreate(token);
              onClose();
            }}
            onCancel={onClose}
          />
        ) : null}
        {open && tab === "workspace" && hasWorkspace ? (
          <WorkspacePicker
            category={category}
            availableShared={availableShared}
            onPick={(id) => {
              onPickShared(id);
              onClose();
            }}
          />
        ) : null}
      </ModalBody>
    </Modal>
  );
}

function WorkspacePicker({
  category,
  availableShared,
  onPick,
}: {
  category: SystemDesignCategory;
  availableShared: AnyToken[];
  onPick: (id: string) => void;
}) {
  if (availableShared.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-[12.5px] text-[var(--text-faint)]">
        Every linkable workspace {CATEGORY_LABEL[category].toLowerCase()} token is already linked.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {availableShared.map((token) => (
        <button
          key={token.id}
          type="button"
          onClick={() => onPick(token.id)}
          className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
        >
          <TokenPreview category={category} token={token} />
          <span className="ml-auto shrink-0 text-[11.5px] text-[var(--text-faint)]">Link</span>
        </button>
      ))}
    </div>
  );
}

export function EditTokenModal({
  category,
  open,
  token,
  onClose,
  onSave,
}: {
  category: SystemDesignCategory;
  open: boolean;
  token?: AnyToken;
  onClose: () => void;
  onSave: (token: AnyToken) => void;
}) {
  const label = CATEGORY_LABEL[category].replace(/s$/, "").toLowerCase();
  return (
    <Modal open={open} onClose={onClose} ariaLabel={`Edit ${label}`}>
      <ModalHeader title={`Edit ${label}`} subtitle="Update this token." onClose={onClose} />
      <ModalBody>
        {open && (
          <TokenForm
            category={category}
            token={token}
            onSave={(next) => {
              onSave(next);
              onClose();
            }}
            onCancel={onClose}
          />
        )}
      </ModalBody>
    </Modal>
  );
}

function ModalTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative px-3 py-2.5 text-[12.5px] font-medium transition-colors",
        active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
      {active && <span className="absolute -bottom-px left-2 right-2 h-0.5 rounded-[2px] bg-[var(--text)]" />}
    </button>
  );
}

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Eye } from "lucide-react";

export function RailToolButton({
  active = false,
  disabled = false,
  label,
  shortcut,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={[
        "relative h-10 w-10 cursor-pointer rounded-[9px] border text-[var(--text-muted)] shadow-none transition-colors duration-[120ms] hover:bg-[var(--surface)] hover:text-[var(--text)]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
          : "border-transparent bg-transparent",
        disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
      {shortcut ? (
        <span className="absolute bottom-[3px] right-1 text-[9px] tabular-nums text-[var(--text-faint)]">
          {shortcut}
        </span>
      ) : null}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {shortcut ? `${label} (${shortcut})` : label}
      </TooltipContent>
    </Tooltip>
  );
}

export function BuilderStackTabs({
  active,
  stackDisabled,
  onBuilder,
  onStack,
  onGallery,
}: {
  active: "builder" | "stack" | "gallery";
  stackDisabled: boolean;
  onBuilder: () => void;
  onStack: () => void;
  onGallery: () => void;
}) {
  return (
    <div
      data-selection-action
      className="flex items-center gap-1 rounded-[10px] border border-[var(--border)] p-1"
    >
      <FloatingTabButton active={active === "builder"} onClick={onBuilder}>
        Builder
      </FloatingTabButton>
      <FloatingTabButton active={active === "stack"} disabled={stackDisabled} onClick={onStack}>
        Stack
      </FloatingTabButton>
      <FloatingTabButton active={active === "gallery"} onClick={onGallery}>
        Gallery
      </FloatingTabButton>
    </div>
  );
}

function FloatingTabButton({
  active,
  disabled = false,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-8 min-w-[86px] cursor-pointer rounded-[8px] border px-4 text-[14px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-transparent bg-[var(--surface-hover)] text-[var(--text)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]",
        disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function CropsOverlayToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-selection-action
      aria-label={active ? "Hide cropped areas" : "Show cropped areas"}
      title={active ? "Hide cropped areas" : "Show cropped areas"}
      onClick={onToggle}
      className={[
        "absolute bottom-3.5 right-3.5 z-30 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[11.5px] font-medium backdrop-blur-[8px] transition-colors duration-[120ms]",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[rgba(20,20,22,0.88)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      <Eye size={13} strokeWidth={1.8} />
      <span>Crops</span>
    </button>
  );
}

export function IconButton({
  danger = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        danger ? "hover:text-[#ff8a8a]" : "",
        className,
      ].join(" ")}
    />
  );
}

export function Key({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-muted)]">
      {children}
    </span>
  );
}

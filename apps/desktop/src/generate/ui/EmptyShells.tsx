import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Image as ImageIcon, Upload } from "lucide-react";
import { GeneratorHeader } from "./GeneratorHeader";
import { readFileAsDataUrl } from "@/lib/utils";
import type { ToolReference } from "../engine/types";
import { inferType, measureImage } from "../engine/image";
import type { ReactNode } from "react";

function ToolsShellContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <GeneratorHeader />
      <div
        className="flex flex-1 items-center justify-center"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          backgroundColor: "#0A0A0B",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ToolsLoadingShell() {
  return (
    <ToolsShellContainer>
      <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]" />
        <span className="text-[13px]">Loading reference…</span>
      </div>
    </ToolsShellContainer>
  );
}

export function ToolsNotFoundShell() {
  return (
    <ToolsShellContainer>
      <div className="flex flex-col items-center gap-2.5 text-[var(--text-muted)]">
        <ImageIcon size={24} strokeWidth={1.6} />
        <h2 className="m-0 text-[16px] text-[var(--text)]">Reference not found</h2>
        <p className="m-0 text-[13px]">
          Volte para{" "}
          <Link
            className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline"
            to="/references"
          >
            References
          </Link>
          .
        </p>
      </div>
    </ToolsShellContainer>
  );
}

export function ToolsEmptyShell({ onUpload }: { onUpload: (next: ToolReference) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ingest = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      setUploading(true);
      try {
        const url = await readFileAsDataUrl(file);
        const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
        onUpload({
          id: `tool-upload-${Date.now().toString(36)}`,
          name: file.name,
          type: inferType(file.name),
          w: dims.w,
          h: dims.h,
          url,
        });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onUpload],
  );

  return (
    <ToolsShellContainer>
      <div className="mx-auto flex w-full max-w-[520px] px-6">
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void ingest(event.dataTransfer.files?.[0]);
          }}
          className={[
            "flex w-full cursor-pointer flex-col items-center gap-4 rounded-[14px] border-[1.5px] border-dashed bg-[rgba(20,20,22,0.55)] px-10 py-16 text-center transition-colors backdrop-blur-[6px]",
            uploading
              ? "pointer-events-none border-[var(--border-strong)] opacity-70"
              : dragActive
                ? "border-[var(--text)]"
                : "border-[var(--border-strong)] hover:border-[var(--text)]",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(event) => {
              void ingest(event.target.files?.[0]);
            }}
          />
          <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]">
            {uploading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]" />
            ) : (
              <Upload size={22} strokeWidth={1.7} />
            )}
          </span>
          <div>
            <p className="m-0 text-[15px] font-semibold text-[var(--text)]">
              {uploading ? "Processing…" : "Drag an image here"}
            </p>
            <p className="m-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">
              Click to select from disk. PNG, JPG, GIF, WebP or SVG.
            </p>
            <p className="m-0 mt-2 text-[11.5px] text-[var(--text-faint)]">
              Or open a saved reference in{" "}
              <Link
                to="/references"
                className="border-b border-[var(--border-strong)] text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
              >
                References
              </Link>
              .
            </p>
          </div>
        </label>
      </div>
    </ToolsShellContainer>
  );
}

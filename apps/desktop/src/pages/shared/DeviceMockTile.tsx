import type { ProjectType } from "@/lib/data/types";

/**
 * The dot-grid preview tile holding a device-shaped placeholder, shared by the
 * project-type and draft-device pickers (NewProjectPage / NewDraftPage). Both
 * rendered byte-identical markup before (UI-17).
 */
export function DeviceMockTile({ type, selected }: { type: ProjectType; selected: boolean }) {
  return (
    <div
      className={[
        "grid h-[120px] place-items-center rounded-[10px] border border-[var(--border)] bg-[#161616]",
        selected ? "text-[var(--text)]" : "text-[var(--text-muted)]",
      ].join(" ")}
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      <DeviceMock type={type} />
    </div>
  );
}

function DeviceMock({ type }: { type: ProjectType }) {
  if (type === "desktop") {
    return (
      <div className="relative h-20 w-[132px] rounded-md border-[1.5px] border-current">
        <span className="absolute -bottom-2.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-b bg-current" />
      </div>
    );
  }
  if (type === "tablet") {
    return (
      <div className="relative h-[100px] w-[78px] rounded-lg border-[1.5px] border-current">
        <span className="absolute bottom-1.5 left-1/2 h-0.5 w-[18px] -translate-x-1/2 rounded bg-current" />
      </div>
    );
  }
  return (
    <div className="relative h-[90px] w-[50px] rounded-lg border-[1.5px] border-current">
      <span className="absolute left-1/2 top-1 h-0.5 w-3.5 -translate-x-1/2 rounded bg-current" />
    </div>
  );
}

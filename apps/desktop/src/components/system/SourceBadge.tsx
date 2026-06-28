import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import { IconLink } from "@/components/icons";
import type { TokenSource } from "@/domain/system-design/resolve";

export function SourceBadge({ source }: { source: TokenSource }) {
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

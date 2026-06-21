import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { setAutoGenerateProjectThumbnails } from "@/lib/storage/repos/settings.repo";
import { regenerateAllProjectThumbnails } from "@/application/thumbnails/projectThumbnail";
import { Switch } from "./Switch";

export function ProjectThumbnailsTab() {
  // Lives outside the draft (like Processing): the toggle persists immediately
  // and turning it on backfills existing projects from their snapshots.
  const { settings } = useGlobalSettings();
  const autoGenerate = settings.projectThumbnails.autoGenerate;

  const handleToggle = (checked: boolean) => {
    void setAutoGenerateProjectThumbnails(checked).then(() => {
      if (checked) void regenerateAllProjectThumbnails();
    });
  };

  return (
    <div className="px-[22px] py-5 grid gap-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Project thumbnails
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between gap-5 px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Auto-generate project thumbnails</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                Build each project card from its first screen's snapshot, wrapping it in a
                device mockup with the project name. Thumbnails refresh when the screen
                changes, and only projects whose first screen already has a snapshot are
                generated.
              </p>
            </div>
            <Switch
              checked={autoGenerate}
              ariaLabel="Auto-generate project thumbnails"
              onChange={handleToggle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

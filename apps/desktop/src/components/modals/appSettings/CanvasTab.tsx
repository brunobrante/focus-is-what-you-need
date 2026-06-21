import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import {
  updateInheritParentBackground,
  updateInvisibleDragGhost,
  updateTreeAutoRevealSelection,
} from "@/domain/settings/updates";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";
import { Switch } from "./Switch";

export function CanvasTab({
  settings,
  onSettingsChange,
}: {
  settings: GlobalSettings;
  onSettingsChange: (settings: GlobalSettings) => void;
}) {
  const autoRevealSelection = settings.canvas.shell.tree.autoRevealSelection;
  const inheritParentBackground = settings.canvas.shell.inheritParentBackground;
  const invisibleDragGhost = settings.canvas.shell.invisibleDragGhost;

  return (
    <div className="px-[22px] py-5 grid gap-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Shell
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between gap-5 px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Inherit parent background</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                When opening a component, the shell color inherits the background of its parent frame.
              </p>
            </div>
            <Switch
              checked={inheritParentBackground}
              ariaLabel="Inherit parent background"
              onChange={(checked) =>
                onSettingsChange(updateInheritParentBackground(settings, checked))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-5 border-t border-[var(--border)] px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Drag ghost for invisible elements</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                While dragging an element that paints nothing (such as an empty wrapper), show
                a faint placeholder with a shadow and dashed outline so you can see what you
                are moving. Purely visual.
              </p>
            </div>
            <Switch
              checked={invisibleDragGhost}
              ariaLabel="Drag ghost for invisible elements"
              onChange={(checked) =>
                onSettingsChange(updateInvisibleDragGhost(settings, checked))
              }
            />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Layers tree
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between gap-5 px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Reveal selected layers</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                Expand parent rows and scroll the tree to the selected canvas element.
              </p>
            </div>
            <Switch
              checked={autoRevealSelection}
              ariaLabel="Reveal selected layers"
              onChange={(checked) =>
                onSettingsChange(updateTreeAutoRevealSelection(settings, checked))
              }
            />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Toolbar config
        </div>
        <p className="m-0 mb-3 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
          Global default styles new canvas elements get when created from the toolbar.
          A workspace overrides these in its Edit page, and each project again in its own.
        </p>
        <ElementDefaultsEditor
          scope="global"
          inherited={DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults}
          override={settings.canvas.elementDefaults}
          parentLabel="default"
          onChange={(next) =>
            onSettingsChange({
              ...settings,
              canvas: {
                ...settings.canvas,
                // At global scope the editor emits the full element-defaults tree.
                elementDefaults: {
                  ...settings.canvas.elementDefaults,
                  ...next,
                } as GlobalSettings["canvas"]["elementDefaults"],
              },
            })
          }
        />
      </div>
    </div>
  );
}

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { Snapshot } from "@/components/Snapshot";
import { PROJECT_TYPE_DIMS } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import type { ProjectRow, ScreenRow } from "@/lib/storage/schema";

export interface ProjectPreviewModalHandle {
  open: (project: ProjectRow, screens: ScreenRow[]) => void;
  close: () => void;
}

export const ProjectPreviewModal = forwardRef<ProjectPreviewModalHandle>(
  function ProjectPreviewModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const dataRef = useRef<{ project: ProjectRow; screens: ScreenRow[] } | null>(null);
    const [selectedScreenId, setSelectedScreenId] = useState("");

    useImperativeHandle(ref, () => ({
      open: (project, screens) => {
        dataRef.current = { project, screens };
        const initial =
          screens.find((s) => s.id === project.previewScreenId)?.id ?? screens[0]?.id ?? "";
        setSelectedScreenId(initial);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    const data = dataRef.current;
    const project = data?.project ?? null;
    const screens = data?.screens ?? [];

    const currentScreen = useMemo(
      () => screens.find((screen) => screen.id === selectedScreenId) ?? screens[0] ?? null,
      [screens, selectedScreenId],
    );

    const currentIndex = Math.max(
      0,
      screens.findIndex((screen) => screen.id === currentScreen?.id),
    );

    if (!project) return null;

    return (
      <Modal open={isOpen} onClose={() => setIsOpen(false)} size="wide" ariaLabel="App preview">
        <ModalHeader
          title="App preview"
          subtitle="Visualize the project's main screens in sequence, focusing on final composition."
          onClose={() => setIsOpen(false)}
        />
        <ModalBody className="!p-0">
          <div className="grid h-full min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] p-6 lg:border-b-0 lg:border-r">
              <div className="mb-6">
                <div className="mb-2 inline-flex rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                  {project.type} · {PROJECT_TYPE_DIMS[project.type]}
                </div>
                <div className="text-[20px] font-semibold tracking-[-0.25px] text-[var(--text)]">{project.name}</div>
                <div className="mt-2 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                  {project.description?.trim() || "Preview focused on the visual experience of the app and the transition between key screens."}
                </div>
              </div>

              <div className="mb-3 text-[11px] uppercase tracking-[0.42px] text-[var(--text-faint)]">
                Screens
              </div>
              <div className="grid gap-2">
                {screens.map((screen, index) => {
                  const active = screen.id === currentScreen?.id;
                  const isDefault = screen.id === project.previewScreenId || (!project.previewScreenId && index === 0);
                  return (
                    <button
                      key={screen.id}
                      type="button"
                      onClick={() => setSelectedScreenId(screen.id)}
                      className={[
                        "cursor-pointer rounded-[14px] border px-3.5 py-3 text-left transition-colors",
                        active
                          ? "border-[rgba(94,162,255,0.65)] bg-[rgba(94,162,255,0.12)]"
                          : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)]",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-[var(--text)]">{screen.title}</span>
                        <span className="text-[11px] text-[var(--text-faint)]">{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        {isDefault ? (
                          <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] uppercase tracking-[0.35px] text-[var(--text-muted)]">
                            Start screen
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(11,13,17,0.78),rgba(11,13,17,0.96))]">
              <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.07)] px-6 py-4">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--text)]">{currentScreen?.title ?? "No screen"}</div>
                  <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                    {screens.length > 0 ? `${currentIndex + 1} de ${screens.length}` : "No screens available"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedScreenId(screens[(currentIndex - 1 + screens.length) % screens.length]?.id ?? "")}
                    disabled={screens.length < 2}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconChevronLeft size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedScreenId(screens[(currentIndex + 1) % screens.length]?.id ?? "")}
                    disabled={screens.length < 2}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconChevronRight size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>

              <div className="dotgrid grid flex-1 place-items-center overflow-auto px-6 py-8">
                {currentScreen ? (
                  <DeviceStage type={project.type}>
                    <Snapshot
                      kind="screen"
                      ownerType="variant"
                      ownerId={currentScreen.activeVariantId}
                      variant={currentScreen.variant}
                      type={project.type}
                      emptyMode="preview"
                      display="fit"
                    />
                  </DeviceStage>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[rgba(255,255,255,0.1)] px-8 py-10 text-[13px] text-[var(--text-muted)]">
                    No screens available para preview.
                  </div>
                )}
              </div>
            </section>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);

function DeviceStage({
  type,
  children,
}: {
  type: ProjectType;
  children: React.ReactNode;
}) {
  const shellClass =
    type === "mobile"
      ? "w-[320px] max-w-full rounded-[34px] p-3"
      : type === "tablet"
        ? "w-[620px] max-w-full rounded-[32px] p-4"
        : "w-[860px] max-w-full rounded-[28px] p-4";

  const viewportClass =
    type === "mobile"
      ? "aspect-[390/844] rounded-[26px]"
      : type === "tablet"
        ? "aspect-[820/1180] rounded-[22px]"
        : "aspect-[1440/900] rounded-[18px]";

  return (
    <div className={["border border-[rgba(255,255,255,0.08)] bg-[#0c0d10] shadow-[0_30px_100px_rgba(0,0,0,0.55)]", shellClass].join(" ")}>
      <div className={["overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[#0f1013]", viewportClass].join(" ")}>
        {children}
      </div>
    </div>
  );
}

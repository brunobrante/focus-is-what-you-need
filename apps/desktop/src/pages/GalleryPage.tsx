import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  NewScreenModal,
} from "@/components/modals/NewScreenModal";
import {
  NewComponentModal,
} from "@/components/modals/NewComponentModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { VersionModeModal, type VersionModeModalHandle } from "@/components/modals/VersionModeModal";
import { InstanceDeleteModal } from "@/components/modals/InstanceDeleteModal";
import { ProjectPreviewModal, type ProjectPreviewModalHandle } from "@/components/modals/ProjectPreviewModal";
import { countScreenInstanceUsages, createScreenVersion } from "@/lib/storage/repos/screens.repo";
import { useGallery } from "@/application/gallery/useGallery";
import { useDeleteComponent } from "@/application/components/useDeleteComponent";
import { useProjectBackTarget } from "@/lib/navigation/useProjectBackTarget";

import {
  Crumbs,
  ProjectOverview,
  Tabs,
  ScreensTab,
  ComponentsTab,
  ReferencesTab,
  SystemTab,
} from "@/routes/Gallery";

export function GalleryPage() {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : "";

  const previewRef = useRef<ProjectPreviewModalHandle>(null);
  const versionScreenRef = useRef<VersionModeModalHandle>(null);
  const navigate = useNavigate();

  const {
    project,
    screens,
    components,
    references,
    activeVariants,
    type,
    projectName,
    tab,
    setTab,
    cmpFilter,
    setCmpFilter,
    screenSections,
    setScreenSections,
    screenSectionById,
    setScreenSectionById,
    componentSections,
    setComponentSections,
    componentSectionById,
    setComponentSectionById,
    pendingScreenDelete,
    setPendingScreenDelete,
    newScreenRef,
    newComponentRef,
    openNewScreen,
    openNewProjectComponent,
    handleScreenCreated,
    handleComponentCreated,
    handleSettingsSaved,
    handleConfirmDeleteScreen,
  } = useGallery(projectId);

  // Component deletion is instance-aware: if the component is linked elsewhere it
  // opens the per-instance copy/delete modal (same as Unlink), then removes the master.
  const { requestDelete: requestDeleteComponent, modal: deleteComponentModal } = useDeleteComponent();

  // Loose projects (no workspace) back out to Home, not the workspace browser.
  const back = useProjectBackTarget(project?.id ?? projectId);

  // Versions are variants of a screen, not separate screens, so every screen row is a
  // real project screen. Its versions live in the screen's Versions tab.
  const projectScreens = screens;

  // Linked-instance usage counts for the master being deleted — drive whether the
  // delete shows the detach-all/cascade choice or a plain confirm.
  const [screenDeleteUsage, setScreenDeleteUsage] = useState(0);

  useEffect(() => {
    if (!pendingScreenDelete) {
      setScreenDeleteUsage(0);
      return;
    }
    let cancelled = false;
    void countScreenInstanceUsages(pendingScreenDelete.id).then((n) => {
      if (!cancelled) setScreenDeleteUsage(n);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingScreenDelete]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 items-center border-b border-[var(--border)] px-5">
        <Crumbs projectName={projectName} type={type} backHref={back.href} backLabel={back.label} />
      </header>

      <>
          <ProjectOverview
            project={project}
            screensCount={projectScreens.length}
            componentsCount={components.length}
            referencesCount={references.length}
            onPreview={projectScreens.length > 0 && project ? () => previewRef.current?.open(project, projectScreens) : null}
            onEdit={() => navigate(`/project/${encodeURIComponent(projectId)}/edit`)}
            editOpen={false}
          />
          <Tabs
            tab={tab}
            onChange={setTab}
            screensCount={projectScreens.length}
            componentsCount={components.length}
            referencesCount={references.length}
          />

          {tab === "screens" && (
            <ScreensTab
              screens={projectScreens}
              type={type}
              projectId={project?.id ?? projectId}
              onNewScreen={openNewScreen}
              sections={screenSections}
              sectionById={screenSectionById}
              onSectionsChange={setScreenSections}
              onSectionByIdChange={setScreenSectionById}
              onRequestDelete={setPendingScreenDelete}
              onRequestVersion={(screen) => {
                versionScreenRef.current?.open({
                  title: `New version of "${screen.title}"`,
                  message: "How should child components behave in the new version?",
                  onSelect: (mode) => {
                    void createScreenVersion({ screenId: screen.id, mode });
                  },
                });
              }}
            />
          )}
          {tab === "components" && (
            <ComponentsTab
              components={components}
              activeVariants={activeVariants}
              screens={projectScreens}
              filter={cmpFilter}
              onFilterChange={setCmpFilter}
              projectId={project?.id ?? projectId}
              type={type}
              onNewComponent={openNewProjectComponent}
              canCreate={Boolean(project)}
              sections={componentSections}
              sectionById={componentSectionById}
              onSectionsChange={setComponentSections}
              onSectionByIdChange={setComponentSectionById}
              onRequestDelete={(c) => void requestDeleteComponent(c)}
            />
          )}
          {tab === "references" && (
            <ReferencesTab
              project={project}
              screens={projectScreens}
              components={components}
              references={references}
            />
          )}
          {tab === "system" && project ? <SystemTab project={project} /> : null}
      </>

      <NewScreenModal
        ref={newScreenRef}
        projectId={project?.id ?? null}
        onCreated={handleScreenCreated}
      />
      <NewComponentModal
        ref={newComponentRef}
        projectId={project?.id ?? null}
        screens={projectScreens}
        onCreated={handleComponentCreated}
      />
      <ProjectPreviewModal ref={previewRef} />
      <VersionModeModal ref={versionScreenRef} />
      {pendingScreenDelete && screenDeleteUsage > 0 ? (
        <InstanceDeleteModal
          open
          entityName={pendingScreenDelete.title}
          usageCount={screenDeleteUsage}
          onCancel={() => setPendingScreenDelete(null)}
          onDetachAll={() => void handleConfirmDeleteScreen("detach")}
          onCascade={() => void handleConfirmDeleteScreen("cascade")}
        />
      ) : (
        <ConfirmActionModal
          open={Boolean(pendingScreenDelete)}
          title="Delete screen"
          message={
            pendingScreenDelete
              ? `Screen "${pendingScreenDelete.title}" will be removed along with its components.`
              : ""
          }
          onClose={() => setPendingScreenDelete(null)}
          onConfirm={handleConfirmDeleteScreen}
        />
      )}
      {deleteComponentModal}
    </div>
  );
}

export default GalleryPage;

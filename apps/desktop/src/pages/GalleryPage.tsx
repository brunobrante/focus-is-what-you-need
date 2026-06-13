import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
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
import { countComponentInstanceUsages } from "@/lib/storage/repos/components.repo";
import { useGallery } from "@/application/gallery/useGallery";

import {
  Crumbs,
  ProjectOverview,
  ProjectEditPanel,
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
  const [editOpen, setEditOpen] = useState(false);

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
    pendingComponentDelete,
    setPendingComponentDelete,
    projectSettingsOpen,
    setProjectSettingsOpen,
    newScreenRef,
    newComponentRef,
    openNewScreen,
    openNewProjectComponent,
    handleScreenCreated,
    handleComponentCreated,
    handleSettingsSaved,
    handleConfirmDeleteScreen,
    handleConfirmDeleteComponent,
  } = useGallery(projectId);

  // Linked-instance usage counts for the master being deleted — drive whether the
  // delete shows the detach-all/cascade choice or a plain confirm.
  const [screenDeleteUsage, setScreenDeleteUsage] = useState(0);
  const [componentDeleteUsage, setComponentDeleteUsage] = useState(0);

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

  useEffect(() => {
    if (!pendingComponentDelete) {
      setComponentDeleteUsage(0);
      return;
    }
    let cancelled = false;
    void countComponentInstanceUsages(pendingComponentDelete.id).then((n) => {
      if (!cancelled) setComponentDeleteUsage(n);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingComponentDelete]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 items-center border-b border-[var(--border)] px-5">
        <Crumbs projectName={projectName} type={type} />
      </header>

      <ProjectOverview
        project={project}
        screensCount={screens.length}
        componentsCount={components.length}
        referencesCount={references.length}
        onPreview={screens.length > 0 && project ? () => previewRef.current?.open(project, screens) : null}
        onEdit={() => setEditOpen((v) => !v)}
        editOpen={editOpen}
      />
      {editOpen && project ? (
        <ProjectEditPanel
          project={project}
          screens={screens}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            handleSettingsSaved(updated);
            setEditOpen(false);
          }}
        />
      ) : (
        <>
          <Tabs
            tab={tab}
            onChange={setTab}
            screensCount={screens.length}
            componentsCount={components.length}
            referencesCount={references.length}
          />

          {tab === "screens" && (
            <ScreensTab
              screens={screens}
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
              screens={screens}
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
              onRequestDelete={setPendingComponentDelete}
            />
          )}
          {tab === "references" && (
            <ReferencesTab
              project={project}
              screens={screens}
              components={components}
              references={references}
            />
          )}
          {tab === "system" && project ? <SystemTab project={project} /> : null}
        </>
      )}

      <NewScreenModal
        ref={newScreenRef}
        projectId={project?.id ?? null}
        onCreated={handleScreenCreated}
      />
      <NewComponentModal
        ref={newComponentRef}
        projectId={project?.id ?? null}
        screens={screens}
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
      {pendingComponentDelete && componentDeleteUsage > 0 ? (
        <InstanceDeleteModal
          open
          entityName={pendingComponentDelete.name}
          usageCount={componentDeleteUsage}
          onCancel={() => setPendingComponentDelete(null)}
          onDetachAll={() => void handleConfirmDeleteComponent("detach")}
          onCascade={() => void handleConfirmDeleteComponent("cascade")}
        />
      ) : (
        <ConfirmActionModal
          open={Boolean(pendingComponentDelete)}
          title="Delete component"
          message={
            pendingComponentDelete
              ? `The component "${pendingComponentDelete.name}" will be removed along with subcomponents and variants.`
              : ""
          }
          onClose={() => setPendingComponentDelete(null)}
          onConfirm={handleConfirmDeleteComponent}
        />
      )}
    </div>
  );
}

export default GalleryPage;

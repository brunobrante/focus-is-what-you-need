import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  NewScreenModal,
} from "@/components/modals/NewScreenModal";
import {
  NewComponentModal,
} from "@/components/modals/NewComponentModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { ProjectPreviewModal, type ProjectPreviewModalHandle } from "@/components/modals/ProjectPreviewModal";
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
      {editOpen && project && (
        <ProjectEditPanel
          project={project}
          screens={screens}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            handleSettingsSaved(updated);
            setEditOpen(false);
          }}
        />
      )}

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
    </div>
  );
}

export default GalleryPage;

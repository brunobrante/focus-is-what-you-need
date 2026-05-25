import type {
  ComponentRow,
  HistoryEntryRow,
  ProjectRow,
  SceneOwnerType,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";

export type SceneOwner = {
  ownerType: SceneOwnerType;
  ownerId: string;
};

export type PersistenceRuntime = "desktop" | "web" | "memory";

export type ScenePatchOperation = {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
};

export type ScenePatch = {
  owner: SceneOwner;
  baseVersion: number;
  operations: ScenePatchOperation[];
  affectedNodeIds: string[];
  affectedComponentIds: string[];
  createdAt: number;
};

export type DependencyEdge = {
  childVariantId: string;
  componentId: string;
  parentOwner: SceneOwner;
  parentNodeId: string;
  projectId: string;
  screenId: string;
  depth: number;
};

export interface ProjectRepository {
  get(id: string): Promise<ProjectRow | null>;
  list(): Promise<ProjectRow[]>;
  upsert(project: ProjectRow): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ScreenRepository {
  get(id: string): Promise<ScreenRow | null>;
  listByProject(projectId: string): Promise<ScreenRow[]>;
  upsert(screen: ScreenRow): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ComponentRepository {
  get(id: string): Promise<ComponentRow | null>;
  listByProject(projectId: string): Promise<ComponentRow[]>;
  listByScreen(screenId: string): Promise<ComponentRow[]>;
  listByParentVariant(parentVariantId: string): Promise<ComponentRow[]>;
  upsert(component: ComponentRow): Promise<void>;
  deleteTree(componentId: string): Promise<void>;
}

export interface VariantRepository {
  get(id: string): Promise<VariantRow | null>;
  listByComponent(componentId: string): Promise<VariantRow[]>;
  upsert(variant: VariantRow): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SceneRepository {
  getByOwner(owner: SceneOwner): Promise<SceneRow | null>;
  upsert(scene: Omit<SceneRow, "id"> & Partial<Pick<SceneRow, "id">>): Promise<SceneRow>;
  appendJournal(patch: ScenePatch): Promise<void>;
  compact(owner: SceneOwner): Promise<SceneRow | null>;
}

export interface ThumbnailRepository {
  getByOwner(owner: SceneOwner): Promise<ThumbnailRow | null>;
  upsert(thumbnail: Omit<ThumbnailRow, "id"> & Partial<Pick<ThumbnailRow, "id">>): Promise<ThumbnailRow>;
  markStale(owner: SceneOwner, sceneVersion: number): Promise<void>;
}

export interface HistoryRepository {
  listByTarget(targetId: string): Promise<HistoryEntryRow[]>;
  append(entry: HistoryEntryRow): Promise<void>;
}

export interface DependencyIndexRepository {
  getParentEdgeForVariant(variantId: string): Promise<DependencyEdge | null>;
  listAncestorEdges(variantId: string): Promise<DependencyEdge[]>;
  upsertEdge(edge: DependencyEdge): Promise<void>;
  removeEdgesForComponent(componentId: string): Promise<void>;
}

export interface UnitOfWork {
  transaction<T>(run: () => Promise<T>): Promise<T>;
}

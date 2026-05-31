import {
  buildMockScreenTree,
  templateForScreen,
  templateForVariant,
  type MockComponentTree,
  type MockScreenTemplate,
  type TreeNode,
} from "@/components/mocks/data/screenMockHierarchy";
import {
  ensureHtmlCanvasSubjectRoot,
  htmlCanvasDocumentFromMockTree,
  serializeHtmlCanvasDocument,
  svgForHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import type {
  ComponentKind,
  ProjectType,
  ScreenVariant,
} from "@/lib/data/types";

type ScreenTemplate = Exclude<ScreenVariant, "empty" | "blank">;

export type CanvasMockKey =
  | "mock-mobile-home"
  | "mock-mobile-list"
  | "mock-mobile-detail"
  | "mock-mobile-formulario"
  | "mock-mobile-alignment-debug"
  | "mock-tablet-home"
  | "mock-tablet-list"
  | "mock-tablet-detail"
  | "mock-tablet-formulario"
  | "mock-tablet-alignment-debug"
  | "mock-desktop-home"
  | "mock-desktop-list"
  | "mock-desktop-detail"
  | "mock-desktop-formulario"
  | "mock-desktop-alignment-debug";

export type EmptyCardMockKey =
  | "mock-mobile-empty-card"
  | "mock-tablet-empty-card"
  | "mock-desktop-empty-card";

export type CanvasMockPreview = {
  key: CanvasMockKey;
  title: string;
  projectType: ProjectType;
  snapshot: string;
};

export type CanvasMockData = CanvasMockPreview & {
  graphJSON: string;
  sceneVersion: 1;
};

export type MockComponentSeed = {
  name: string;
  kind: ComponentKind;
  canvas: CanvasMockData;
  children: MockComponentSeed[];
};

export type ScreenMockSeedBundle = {
  template: MockScreenTemplate;
  screen: CanvasMockData;
  components: MockComponentSeed[];
};

export type CanvasCardEmptyMock = {
  key: EmptyCardMockKey;
  projectType: ProjectType;
  title: string;
};

type ScreenLookup = {
  title: string;
  variant: ScreenVariant;
};

const SVG_DATA_URL_PREFIX = "data:image/svg+xml;utf8,";
const PROJECT_TYPES: ProjectType[] = ["mobile", "tablet", "desktop"];
const MOCK_TEMPLATES: MockScreenTemplate[] = [
  "home",
  "list",
  "detail",
  "formulario",
  "alignment-debug",
];

const MOCK_PREVIEWS: Record<CanvasMockKey, CanvasMockPreview> =
  Object.fromEntries(
    PROJECT_TYPES.flatMap((projectType) =>
      MOCK_TEMPLATES.map((template) => previewEntry(projectType, template)),
    ),
  ) as Record<CanvasMockKey, CanvasMockPreview>;

let datasetPromise: Promise<Record<CanvasMockKey, CanvasMockData>> | null = null;
let bundlePromise: Promise<Record<CanvasMockKey, ScreenMockSeedBundle>> | null = null;

export async function getCanvasMockDataset(): Promise<
  Record<CanvasMockKey, CanvasMockData>
> {
  datasetPromise ??= getCanvasMockBundleDataset().then((bundles) =>
    Object.fromEntries(
      Object.values(bundles).map((bundle) => [bundle.screen.key, bundle.screen]),
    ) as Record<CanvasMockKey, CanvasMockData>,
  );

  return datasetPromise;
}

export async function getCanvasMockBundleForScreen(
  screen: ScreenLookup,
  projectType: ProjectType,
): Promise<ScreenMockSeedBundle | null> {
  const template = templateForScreen(screen);
  if (!template) return null;
  const bundles = await getCanvasMockBundleDataset();
  return bundles[keyFor(projectType, template)] ?? null;
}

export async function getCanvasMockForScreen(
  screen: ScreenLookup,
  projectType: ProjectType,
): Promise<CanvasMockData | null> {
  const bundle = await getCanvasMockBundleForScreen(screen, projectType);
  return bundle?.screen ?? null;
}

export function getCanvasMockForTemplate(
  template: ScreenTemplate,
  projectType: ProjectType,
): CanvasMockPreview | null {
  const realTemplate = templateForVariant(template);
  if (!realTemplate) return null;
  return MOCK_PREVIEWS[keyFor(projectType, realTemplate)];
}

export function getCanvasCardEmptyMock(
  projectType: ProjectType,
): CanvasCardEmptyMock {
  return {
    key: `mock-${projectType}-empty-card` as EmptyCardMockKey,
    projectType,
    title: "Empty card",
  };
}

export async function renderCanvasMockSVG(
  key: CanvasMockKey,
): Promise<string | null> {
  const tree = buildScreenMockTreeFromKey(key);
  return svgForHtmlCanvasDocument(
    ensureHtmlCanvasSubjectRoot(htmlCanvasDocumentFromMockTree(tree), {
      wrapperName: `${tree.props.name ?? "Canvas"} Canvas`,
    }),
  );
}

async function getCanvasMockBundleDataset(): Promise<
  Record<CanvasMockKey, ScreenMockSeedBundle>
> {
  bundlePromise ??= Promise.all(
    PROJECT_TYPES.flatMap((projectType) =>
      MOCK_TEMPLATES.map(async (template) => {
        const bundle = await buildSeedBundle(projectType, template);
        return [bundle.screen.key, bundle] as const;
      }),
    ),
  ).then(
    (entries) =>
      Object.fromEntries(entries) as Record<CanvasMockKey, ScreenMockSeedBundle>,
  );

  return bundlePromise;
}

async function buildSeedBundle(
  projectType: ProjectType,
  template: MockScreenTemplate,
): Promise<ScreenMockSeedBundle> {
  const mockTree = buildMockScreenTree(template, projectType);
  const key = keyFor(projectType, template);
  const screen = await canvasDataForTree(key, mockTree.title, projectType, mockTree.tree);
  const components = await Promise.all(
    mockTree.components.map((component) =>
      buildComponentSeed(projectType, template, component),
    ),
  );

  return { template, screen, components };
}

async function buildComponentSeed(
  projectType: ProjectType,
  template: MockScreenTemplate,
  component: MockComponentTree,
): Promise<MockComponentSeed> {
  const canvas = await canvasDataForTree(
    keyFor(projectType, template),
    component.name,
    projectType,
    component.tree,
  );
  const children = await Promise.all(
    component.children.map((child) => buildComponentSeed(projectType, template, child)),
  );

  return {
    name: component.name,
    kind: component.kind,
    canvas,
    children,
  };
}

async function canvasDataForTree(
  key: CanvasMockKey,
  title: string,
  projectType: ProjectType,
  tree: TreeNode,
): Promise<CanvasMockData> {
  const document = ensureHtmlCanvasSubjectRoot(
    htmlCanvasDocumentFromMockTree(tree),
    {
      wrapperName: `${title} Canvas`,
      subjectLocked: true,
    },
  );
  const graphJSON = serializeHtmlCanvasDocument(document);
  const svg = svgForHtmlCanvasDocument(document);
  return {
    key,
    title,
    projectType,
    snapshot: svgDataUrl(svg),
    graphJSON,
    sceneVersion: 1,
  };
}

function previewEntry(
  projectType: ProjectType,
  template: MockScreenTemplate,
): [CanvasMockKey, CanvasMockPreview] {
  const key = keyFor(projectType, template);
  return [
    key,
    {
      key,
      projectType,
      title: titleForTemplate(template),
      snapshot: svgDataUrl(previewSnapshotSVG(projectType, template)),
    },
  ];
}

function titleForTemplate(template: MockScreenTemplate): string {
  if (template === "home") return "Home";
  if (template === "list") return "List";
  if (template === "detail") return "Detail";
  if (template === "alignment-debug") return "Alignment Debug";
  return "Form";
}

function keyFor(
  projectType: ProjectType,
  template: MockScreenTemplate,
): CanvasMockKey {
  return `mock-${projectType}-${template}` as CanvasMockKey;
}

function templateFromKey(key: CanvasMockKey): MockScreenTemplate {
  if (key.endsWith("-alignment-debug")) return "alignment-debug";
  if (key.endsWith("-home")) return "home";
  if (key.endsWith("-list")) return "list";
  if (key.endsWith("-detail")) return "detail";
  return "formulario";
}

function projectTypeFromKey(key: CanvasMockKey): ProjectType {
  if (key.includes("-desktop-")) return "desktop";
  if (key.includes("-tablet-")) return "tablet";
  return "mobile";
}

function buildScreenMockTreeFromKey(key: CanvasMockKey): TreeNode {
  return buildMockScreenTree(
    templateFromKey(key),
    projectTypeFromKey(key),
  ).tree;
}

function svgDataUrl(svg: string): string {
  return SVG_DATA_URL_PREFIX + encodeURIComponent(svg.replace(/\s+/g, " ").trim());
}

function previewSnapshotSVG(
  projectType: ProjectType,
  template: MockScreenTemplate,
): string {
  const size =
    projectType === "desktop"
      ? { w: 1440, h: 900, pad: 64, hero: 240 }
      : projectType === "tablet"
        ? { w: 820, h: 1180, pad: 40, hero: 212 }
        : { w: 390, h: 844, pad: 24, hero: 166 };

  if (template === "alignment-debug") {
    const box = 30;
    const x = (size.w - box) / 2;
    const y = (size.h - box) / 2;
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}" fill="none">
        <rect width="${size.w}" height="${size.h}" fill="#FFFFFF" />
        <rect x="${x}" y="${y}" width="${box}" height="${box}" fill="#FF0000" />
      </svg>
    `;
  }

  const inner = size.w - size.pad * 2;
  const sectionY =
    template === "home"
      ? [88, 282, 338, 386, 624]
      : template === "list"
        ? [88, 164, 226, 278, 634]
        : template === "detail"
          ? [88, 168, 430, 572, 682]
          : [88, 164, 422, 510];

  const body =
    template === "home"
      ? [
          previewRect(size.pad, sectionY[0], inner, 72, "#FFFFFF", 24),
          previewRect(size.pad, sectionY[1], inner, size.hero, "#0F2D2E", 28),
          previewChips(size.pad, sectionY[2], projectType),
          previewCards(size.pad, sectionY[3], projectType),
          previewRect(size.pad, sectionY[4], inner, projectType === "mobile" ? 88 : 104, "#0F2D2E", 28),
        ].join("")
      : template === "list"
        ? [
            previewRect(size.pad, sectionY[0], inner, 72, "#FFFFFF", 24),
            previewRect(size.pad, sectionY[1], inner, projectType === "mobile" ? 50 : 56, "#FFFFFF", 24),
            previewChips(size.pad, sectionY[2], projectType),
            previewRows(size.pad, sectionY[3], projectType),
            previewRect(size.pad, sectionY[4], inner, projectType === "mobile" ? 88 : 104, "#0F2D2E", 28),
          ].join("")
        : template === "detail"
          ? [
              previewRect(size.pad, sectionY[0], inner, 72, "#FFFFFF", 24),
              previewRect(size.pad, sectionY[1], inner, projectType === "mobile" ? 250 : 300, "#FFFFFF", 28),
              previewTextBlock(size.pad, sectionY[2], inner * 0.7),
              previewRows(size.pad, sectionY[3], projectType, 2),
              previewRect(size.pad, sectionY[4], inner, projectType === "mobile" ? 88 : 104, "#0F2D2E", 28),
            ].join("")
          : [
              previewRect(size.pad, sectionY[0], inner, 72, "#FFFFFF", 24),
              previewForm(size.pad, sectionY[1], inner, projectType),
              previewChips(size.pad, sectionY[2], projectType, true),
              previewRect(size.pad, sectionY[3], inner, projectType === "mobile" ? 88 : 104, "#0F2D2E", 28),
            ].join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}" fill="none">
      <rect width="${size.w}" height="${size.h}" rx="${projectType === "desktop" ? 0 : 32}" fill="#F7F7F2" />
      ${body}
    </svg>
  `;
}

function previewRect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  radius: number,
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" />`;
}

function previewChips(
  x: number,
  y: number,
  projectType: ProjectType,
  compact = false,
): string {
  const widths =
    projectType === "mobile"
      ? compact
        ? [92, 74, 108]
        : [102, 100, 96]
      : projectType === "tablet"
        ? compact
          ? [96, 84, 124]
          : [140, 140, 132, 144]
        : compact
          ? [96, 84, 124]
          : [176, 168, 160, 172];
  const gap = projectType === "mobile" ? 8 : 12;
  const h = projectType === "mobile" ? 36 : 42;
  return widths
    .map((width, index) => previewRect(x + index * (width + gap), y, width, h, index === 0 ? "#B9E769" : "#FFFFFF", h / 2))
    .join("");
}

function previewCards(
  x: number,
  y: number,
  projectType: ProjectType,
): string {
  const cardW =
    projectType === "desktop" ? 368 : projectType === "tablet" ? 220 : 150;
  const cardH =
    projectType === "desktop" ? 248 : projectType === "tablet" ? 224 : 184;
  const count = projectType === "mobile" ? 2 : 3;
  const gap = projectType === "mobile" ? 12 : 16;
  return Array.from({ length: count })
    .map((_, index) =>
      previewRect(
        x + index * (cardW + gap),
        y,
        cardW,
        cardH,
        "#FFFFFF",
        26,
      ),
    )
    .join("");
}

function previewRows(
  x: number,
  y: number,
  projectType: ProjectType,
  count = 3,
): string {
  const rowH =
    projectType === "desktop" ? 138 : projectType === "tablet" ? 130 : 104;
  const totalW = projectType === "desktop" ? 1312 : projectType === "tablet" ? 740 : 342;
  const gap = projectType === "mobile" ? 10 : 12;
  return Array.from({ length: count })
    .map((_, index) =>
      previewRect(x, y + index * (rowH + gap), totalW, rowH, "#FFFFFF", 26),
    )
    .join("");
}

function previewTextBlock(x: number, y: number, w: number): string {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="28" rx="10" fill="#B9E769" />`,
    `<rect x="${x}" y="${y + 44}" width="${w * 0.84}" height="12" rx="6" fill="#B7C2BA" />`,
    `<rect x="${x}" y="${y + 66}" width="${w * 0.62}" height="12" rx="6" fill="#B7C2BA" />`,
  ].join("");
}

function previewForm(
  x: number,
  y: number,
  w: number,
  projectType: ProjectType,
): string {
  const fieldH = projectType === "mobile" ? 58 : 68;
  const gap = projectType === "mobile" ? 12 : 14;
  const fieldW = w - (projectType === "mobile" ? 32 : 40);
  return [
    previewRect(x, y, w, projectType === "mobile" ? 240 : 266, "#FFFFFF", 28),
    ...Array.from({ length: 3 }).map((_, index) =>
      previewRect(
        x + (projectType === "mobile" ? 16 : 20),
        y + 50 + index * (fieldH + gap),
        fieldW,
        projectType === "mobile" ? 40 : 44,
        "#EEF2E9",
        18,
      ),
    ),
  ].join("");
}

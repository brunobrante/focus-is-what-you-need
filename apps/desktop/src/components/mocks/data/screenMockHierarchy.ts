import type {
  ComponentKind,
  ProjectType,
  ScreenVariant,
} from "@/lib/data/types";

export type MockScreenTemplate =
  | "home"
  | "list"
  | "detail"
  | "form"
  | "formulario"
  | "alignment-debug";

export type TreeNode = {
  type: string;
  props: Record<string, unknown>;
  children: Array<TreeNode | string>;
};

export type MockComponentTree = {
  name: string;
  kind: ComponentKind;
  tree: TreeNode;
  children: MockComponentTree[];
};

export type MockScreenTree = {
  title: string;
  variant: ScreenVariant;
  tree: TreeNode;
  components: MockComponentTree[];
};

type DeviceSpec = {
  projectType: ProjectType;
  w: number;
  h: number;
  pad: number;
  topInset: number;
  bottomInset: number;
  sectionGap: number;
  radius: number;
  headerH: number;
  heroH: number;
  chipH: number;
  cardW: number;
  cardH: number;
  rowH: number;
  galleryH: number;
  formFieldH: number;
  cartH: number;
  contentW: number;
};

type BlockOptions = {
  flex?: "row" | "col";
  gap?: number;
  rounded?: number;
  justify?: "start" | "center" | "end" | "between";
  items?: "start" | "center" | "end" | "stretch";
  px?: number;
  py?: number;
  p?: number;
  stroke?: string;
  strokeWidth?: number;
  overflow?: "visible" | "hidden";
};

const SCREEN_BG = "#EEF2FF";
const INK = "#101828";
const MUTED = "#475467";
const WHITE = "#FFFFFF";
const LINE = "#1F2937";

const COLORS = {
  header: "#FFE08A",
  logo: "#111827",
  hero: "#7C3AED",
  heroAlt: "#A78BFA",
  categories: "#14B8A6",
  featured: "#F97316",
  search: "#A7F3D0",
  filters: "#FDE68A",
  results: "#60A5FA",
  gallery: "#F472B6",
  summary: "#A3E635",
  options: "#38BDF8",
  form: "#F9A8D4",
  payment: "#C4B5FD",
  cart: "#111827",
  cardA: "#FDE047",
  cardB: "#22D3EE",
  cardC: "#FB7185",
  cardD: "#34D399",
};

export function buildMockScreenTree(
  template: MockScreenTemplate,
  projectType: ProjectType,
): MockScreenTree {
  const d = deviceFor(projectType);
  switch (template) {
    case "home":
      return buildHomeTree(d);
    case "list":
      return buildListTree(d);
    case "detail":
      return buildDetailTree(d);
    case "form":
    case "formulario":
      return buildFormTree(d);
    case "alignment-debug":
      return buildAlignmentDebugTree(d);
  }
}

export function templateForScreen(
  screen: { title: string; variant: ScreenVariant },
): MockScreenTemplate | null {
  const title = normalize(screen.title);
  if (title.includes("home")) return "home";
  if (title.includes("list")) return "list";
  if (title.includes("detail")) return "detail";
  if (title.includes("form")) return "form";
  if (title.includes("alignment")) {
    return "alignment-debug";
  }
  return null;
}

export function templateForVariant(
  variant: Exclude<ScreenVariant, "empty" | "blank">,
): MockScreenTemplate | null {
  if (variant === "hero") return "home";
  if (variant === "list") return "list";
  if (variant === "detail") return "detail";
  if (variant === "form") return "form";
  return null;
}

function deviceFor(projectType: ProjectType): DeviceSpec {
  if (projectType === "desktop") {
    const w = 1440;
    const pad = 64;
    return {
      projectType,
      w,
      h: 900,
      pad,
      topInset: 44,
      bottomInset: 44,
      sectionGap: 20,
      radius: 24,
      headerH: 76,
      heroH: 238,
      chipH: 46,
      cardW: 380,
      cardH: 190,
      rowH: 112,
      galleryH: 238,
      formFieldH: 66,
      cartH: 96,
      contentW: w - pad * 2,
    };
  }

  if (projectType === "tablet") {
    const w = 820;
    const pad = 40;
    return {
      projectType,
      w,
      h: 1180,
      pad,
      topInset: 46,
      bottomInset: 42,
      sectionGap: 20,
      radius: 24,
      headerH: 76,
      heroH: 224,
      chipH: 42,
      cardW: 226,
      cardH: 182,
      rowH: 108,
      galleryH: 248,
      formFieldH: 64,
      cartH: 92,
      contentW: w - pad * 2,
    };
  }

  const w = 390;
  const pad = 24;
  return {
    projectType,
    w,
    h: 844,
    pad,
    topInset: 54,
    bottomInset: 32,
    sectionGap: 16,
    radius: 22,
    headerH: 72,
    heroH: 174,
    chipH: 36,
    cardW: 150,
    cardH: 164,
    rowH: 92,
    galleryH: 178,
    formFieldH: 56,
    cartH: 84,
    contentW: w - pad * 2,
  };
}

function buildHomeTree(d: DeviceSpec): MockScreenTree {
  const header = createHeader(d, "Internal Dashboard", "Operational Summary");
  const hero = createHeroBanner(d);
  const categories = createCategoryStrip(d);
  const featured = createFeaturedList(d);
  const cart = createMobileCart(d, "3 alerts", "$482k", "Review");

  return {
    title: "Home",
    variant: "hero",
    components: [header, hero, categories, featured, cart],
    tree: screenFrame(d, "Home", [
      header.tree,
      hero.tree,
      categories.tree,
      featured.tree,
      cart.tree,
    ]),
  };
}

function buildListTree(d: DeviceSpec): MockScreenTree {
  const header = createHeader(d, "List", "Orders in progress");
  const search = createSearchBar(d);
  const filters = createFilterStrip(d);
  const results = createProductResults(d);
  const cart = createMobileCart(d, "12 selected", "SLA 94%", "Export");

  return {
    title: "List",
    variant: "list",
    components: [header, search, filters, results, cart],
    tree: screenFrame(d, "List", [
      header.tree,
      search.tree,
      filters.tree,
      results.tree,
      cart.tree,
    ]),
  };
}

function buildDetailTree(d: DeviceSpec): MockScreenTree {
  const header = createHeader(d, "Detail", "Order #1842");
  const gallery = createProductGallery(d);
  const summary = createProductSummary(d);
  const options = createOptionsList(d);
  const cart = createMobileCart(d, "Medium risk", "4 actions", "Approve", true);

  return {
    title: "Detail",
    variant: "detail",
    components: [header, gallery, summary, options, cart],
    tree: screenFrame(d, "Detail", [
      header.tree,
      gallery.tree,
      summary.tree,
      options.tree,
      cart.tree,
    ]),
  };
}

function buildFormTree(d: DeviceSpec): MockScreenTree {
  const header = createHeader(d, "Form", "New Request");
  const shipping = createShippingForm(d);
  const payment = createPaymentMethods(d);
  const cart = createMobileCart(d, "Draft saved", "5 fields", "Submit", true);

  return {
    title: "Form",
    variant: "form",
    components: [header, shipping, payment, cart],
    tree: screenFrame(d, "Form", [
      header.tree,
      shipping.tree,
      payment.tree,
      cart.tree,
    ]),
  };
}

function buildAlignmentDebugTree(d: DeviceSpec): MockScreenTree {
  const box = simpleBlock(
    "Red Alignment Box",
    "Atom",
    30,
    30,
    "#FF0000",
    [],
  );

  return {
    title: "Alignment Debug",
    variant: "blank",
    components: [box],
    tree: node(
      "frame",
      {
        name: "Alignment Debug",
        w: d.w,
        h: d.h,
        bg: "#FFFFFF",
        rounded: 0,
        overflow: "hidden",
        flex: "col",
        justify: "center",
        items: "center",
      },
      [box.tree],
    ),
  };
}

function screenFrame(
  d: DeviceSpec,
  name: string,
  children: TreeNode[],
): TreeNode {
  return node(
    "frame",
    {
      name,
      w: d.w,
      h: d.h,
      bg: SCREEN_BG,
      rounded: d.projectType === "desktop" ? 0 : 32,
      overflow: "hidden",
      flex: "col",
      gap: d.sectionGap,
      px: d.pad,
      py: d.topInset,
    },
    children,
  );
}

function createHeader(
  d: DeviceSpec,
  eyebrow: string,
  title: string,
): MockComponentTree {
  const logo = simpleBlock(
    "Logo Design",
    "Atom",
    d.projectType === "mobile" ? 52 : 60,
    d.projectType === "mobile" ? 52 : 60,
    COLORS.logo,
    [
      shape("ellipse", 24, 24, COLORS.categories),
      text("AO", 24, 18, 12, 900, WHITE),
    ],
    { rounded: 18, justify: "center", items: "center", gap: 4 },
  );

  const copyW = Math.max(140, d.contentW - readLogoW(d) - readSearchW(d) - 70);
  const copy = simpleBlock(
    "Header Copy",
    "Atom",
    copyW,
    42,
    "#FFF4C7",
    [
      text(eyebrow, copyW - 12, 16, 11, 800, MUTED),
      text(title, copyW - 12, 22, d.projectType === "mobile" ? 16 : 19, 900, INK),
    ],
    { rounded: 12, justify: "center", gap: 4, px: 6 },
  );

  const search = simpleBlock(
    "Search Button",
    "Atom",
    readSearchW(d),
    readSearchW(d),
    "#FFFFFF",
    [
      shape("ellipse", 18, 18, "transparent", { stroke: INK, strokeWidth: 2 }),
      shape("rectangle", 9, 3, INK, { rounded: 2, rotation: 45 }),
    ],
    { rounded: 999, justify: "center", items: "center", gap: 1, stroke: LINE },
  );

  return component(
    "Header",
    "Layout",
    [logo, copy, search],
    frame("Header", d.contentW, d.headerH, COLORS.header, [logo.tree, copy.tree, search.tree], {
      rounded: d.radius,
      stroke: LINE,
      flex: "row",
      justify: "between",
      items: "center",
      px: d.projectType === "mobile" ? 14 : 18,
    }),
  );
}

function createHeroBanner(d: DeviceSpec): MockComponentTree {
  const copyW = d.projectType === "mobile" ? 168 : d.projectType === "tablet" ? 330 : 520;
  const copy = simpleBlock(
    "Hero Copy",
    "Atom",
    copyW,
    d.heroH - 46,
    "#6D28D9",
    [
      text("Revenue today", copyW - 24, 18, 12, 800, "#DDD6FE"),
      text("R$ 482.900", copyW - 24, 42, d.projectType === "mobile" ? 27 : 40, 950, WHITE),
      text("Operation 18% above target so far.", copyW - 24, 42, 12, 700, "#EDE9FE"),
    ],
    { rounded: 18, gap: 8, px: 12, py: 12 },
  );

  const cta = buttonAtom("Primary CTA", "Open panel", d.projectType === "mobile" ? 116 : 150, 40, "#FDE047", INK);
  const art = simpleBlock(
    "Hero Illustration",
    "Atom",
    d.projectType === "mobile" ? 112 : d.projectType === "tablet" ? 210 : 330,
    d.projectType === "mobile" ? 112 : d.projectType === "tablet" ? 170 : 180,
    COLORS.heroAlt,
    [
      shape("ellipse", d.projectType === "mobile" ? 64 : 100, d.projectType === "mobile" ? 64 : 100, "#22D3EE"),
      shape("rectangle", d.projectType === "mobile" ? 82 : 144, 24, "#FDE047", { rounded: 999 }),
      shape("rectangle", d.projectType === "mobile" ? 46 : 72, 46, "#FB7185", { rounded: 18 }),
    ],
    { rounded: 22, justify: "center", items: "center", gap: 10 },
  );

  return component(
    "Hero Banner",
    "Section",
    [copy, cta, art],
    frame("Hero Banner", d.contentW, d.heroH, COLORS.hero, [
      stack("hero-copy-column", [copy.tree, cta.tree], {
        gap: d.projectType === "mobile" ? 10 : 14,
        items: "start",
      }),
      art.tree,
    ], {
      rounded: d.radius + 4,
      flex: "row",
      justify: "between",
      items: "center",
      px: d.projectType === "mobile" ? 16 : 28,
      py: d.projectType === "mobile" ? 16 : 24,
    }),
  );
}

function createCategoryStrip(d: DeviceSpec): MockComponentTree {
  const labels = d.projectType === "mobile"
    ? ["Revenue", "Orders", "Risk"]
    : ["Revenue", "Orders", "Teams", "Risk"];
  const chips = labels.map((label, index) =>
    chipAtom(
      `Category Chip - ${label}`,
      label,
      d.projectType === "mobile" ? 104 : d.projectType === "tablet" ? 150 : 188,
      d.chipH,
      index === 0 ? COLORS.cardA : index === 1 ? COLORS.cardB : index === 2 ? COLORS.cardC : COLORS.cardD,
      INK,
    ),
  );

  return component(
    "Category Strip",
    "Pattern",
    chips,
    frame("Category Strip", d.contentW, d.chipH, COLORS.categories, chips.map((chip) => chip.tree), {
      rounded: d.radius,
      flex: "row",
      gap: d.projectType === "mobile" ? 8 : 12,
      items: "center",
      px: d.projectType === "mobile" ? 0 : 12,
    }),
  );
}

function createFeaturedList(d: DeviceSpec): MockComponentTree {
  const title = textAtom("Section Heading", "Indicadores principais", d.contentW, 28, d.projectType === "mobile" ? 18 : 22, 900, INK);
  const cards = [
    metricCard(d, "Metric Card - Revenue", "Revenue today", "$482k", COLORS.cardA),
    metricCard(d, "Metric Card - SLA", "SLA entrega", "94%", COLORS.cardB),
    ...(d.projectType === "mobile"
      ? []
      : [metricCard(d, "Metric Card - Backlog", "Backlog", "128", COLORS.cardC)]),
  ];

  return component(
    "Featured List",
    "Pattern",
    [title, ...cards],
    stack("Featured List", [
      title.tree,
      frame("featured-row", d.contentW, d.cardH, "transparent", cards.map((card) => card.tree), {
        flex: "row",
        gap: d.projectType === "mobile" ? 12 : 16,
      }),
    ], {
      gap: d.projectType === "mobile" ? 10 : 14,
    }),
  );
}

function createSearchBar(d: DeviceSpec): MockComponentTree {
  const icon = simpleBlock("Search Icon", "Atom", 28, 28, "#10B981", [
    shape("ellipse", 16, 16, "transparent", { stroke: WHITE, strokeWidth: 2 }),
    shape("rectangle", 9, 3, WHITE, { rounded: 2, rotation: 45 }),
  ], { rounded: 999, justify: "center", items: "center", gap: 1 });
  const input = textAtom(
    "Search Placeholder",
    "Search order, customer or status",
    Math.max(150, d.contentW - 150),
    24,
    13,
    750,
    INK,
  );
  const filter = buttonAtom("Filter Button", "Filters", d.projectType === "mobile" ? 84 : 104, 40, "#111827", WHITE);

  return component(
    "Search Bar",
    "Pattern",
    [icon, input, filter],
    frame("Search Bar", d.contentW, d.projectType === "mobile" ? 52 : 58, COLORS.search, [
      frame("search-left", Math.max(190, d.contentW - 120), 32, "transparent", [icon.tree, input.tree], {
        flex: "row",
        gap: 10,
        items: "center",
      }),
      filter.tree,
    ], {
      rounded: d.radius,
      stroke: LINE,
      flex: "row",
      justify: "between",
      items: "center",
      px: 14,
    }),
  );
}

function createFilterStrip(d: DeviceSpec): MockComponentTree {
  const chips = [
    chipAtom("Filter Chip - Late", "Late", d.projectType === "mobile" ? 104 : 132, d.chipH, "#FB7185", INK),
    chipAtom("Filter Chip - Today", "Today", d.projectType === "mobile" ? 78 : 104, d.chipH, "#FDE047", INK),
    chipAtom("Filter Chip - High value", "High value", d.projectType === "mobile" ? 116 : 136, d.chipH, "#22D3EE", INK),
  ];

  return component(
    "Filter Chips",
    "Pattern",
    chips,
    frame("Filter Chips", d.contentW, d.chipH, COLORS.filters, chips.map((chip) => chip.tree), {
      rounded: d.radius,
      flex: "row",
      gap: d.projectType === "mobile" ? 8 : 12,
      items: "center",
    }),
  );
}

function createProductResults(d: DeviceSpec): MockComponentTree {
  const rows = [
    resultRow(d, "Result Row - Order 1842", "Order #1842", "ACME Corp · in separation", "$18k", COLORS.cardC),
    resultRow(d, "Result Row - Order 1920", "Order #1920", "Blue Market · awaiting invoice", "$9k", COLORS.cardB),
    resultRow(d, "Result Row - Order 2041", "Order #2041", "Nova Retail · ready for shipping", "$31k", COLORS.cardD),
  ];

  return component(
    "Product Results",
    "Pattern",
    rows,
    stack("Product Results", rows.map((row) => row.tree), {
      gap: d.projectType === "mobile" ? 10 : 12,
    }),
  );
}

function createProductGallery(d: DeviceSpec): MockComponentTree {
  const hero = simpleBlock(
    "Gallery Hero",
    "Atom",
    d.contentW,
    d.galleryH,
    COLORS.gallery,
    [
      shape("ellipse", d.projectType === "mobile" ? 122 : 172, d.projectType === "mobile" ? 122 : 172, "#FDE047"),
      shape("rectangle", d.projectType === "mobile" ? 138 : 220, 32, "#111827", { rounded: 999 }),
      shape("rectangle", d.projectType === "mobile" ? 78 : 112, 78, "#22D3EE", { rounded: 24 }),
    ],
    { rounded: d.radius + 4, justify: "center", items: "center", gap: 12, stroke: LINE },
  );
  const dots = simpleBlock("Gallery Dots", "Atom", 76, 14, "transparent", [
    shape("ellipse", 10, 10, COLORS.gallery),
    shape("ellipse", 10, 10, "#CBD5E1"),
    shape("ellipse", 10, 10, "#CBD5E1"),
  ], { flex: "row", gap: 8, items: "center" });

  return component(
    "Product Gallery",
    "Section",
    [hero, dots],
    stack("Product Gallery", [hero.tree, dots.tree], { gap: 10, items: "center" }),
  );
}

function createProductSummary(d: DeviceSpec): MockComponentTree {
  const title = textAtom("Product Title", "Order #1842 · ACME Corp", d.contentW, 30, d.projectType === "mobile" ? 21 : 29, 950, INK);
  const status = chipAtom("Status Badge", "Separation in progress", d.projectType === "mobile" ? 190 : 250, 34, "#111827", WHITE);
  const amount = simpleBlock("Price Copy", "Atom", d.projectType === "mobile" ? 110 : 136, 38, "#FDE047", [
    text("R$ 18k", d.projectType === "mobile" ? 92 : 118, 24, d.projectType === "mobile" ? 17 : 20, 950, INK),
  ], { rounded: 18, justify: "center", items: "center" });
  const note = textAtom(
    "Description Copy",
    "Premium client, express route and delivery window until 4pm.",
    d.contentW,
    d.projectType === "mobile" ? 44 : 50,
    13,
    700,
    MUTED,
  );

  return component(
    "Product Summary",
    "Section",
    [title, status, amount, note],
    stack("Product Summary", [title.tree, status.tree, amount.tree, note.tree], {
      gap: d.projectType === "mobile" ? 8 : 10,
      p: d.projectType === "mobile" ? 0 : 4,
    }),
  );
}

function createOptionsList(d: DeviceSpec): MockComponentTree {
  const rows = [
    optionRow(d, "Option Row - Prioridade", "Prioridade", "Alta"),
    optionRow(d, "Option Row - Responsavel", "Responsavel", "Equipe Norte"),
    optionRow(d, "Option Row - Canal", "Canal", "B2B"),
  ];

  return component(
    "Options List",
    "Pattern",
    rows,
    stack("Options List", rows.map((row) => row.tree), {
      gap: d.projectType === "mobile" ? 8 : 10,
    }),
  );
}

function createShippingForm(d: DeviceSpec): MockComponentTree {
  const heading = textAtom("Form Heading", "Request details", d.contentW, 28, d.projectType === "mobile" ? 18 : 22, 900, INK);
  const fields = [
    formField(d, "Field - Name", "Requester", "Marina Costa"),
    formField(d, "Field - Address", "Cost center", "OPS-4421"),
    formField(d, "Field - Notes", "Notes", "Prioritize express route"),
  ];

  return component(
    "Shipping Form",
    "Section",
    [heading, ...fields],
    frame("Shipping Form", d.contentW, undefined, COLORS.form, [
      heading.tree,
      ...fields.map((field) => field.tree),
    ], {
      rounded: d.radius,
      stroke: LINE,
      gap: d.projectType === "mobile" ? 12 : 14,
      p: d.projectType === "mobile" ? 14 : 20,
    }),
  );
}

function createPaymentMethods(d: DeviceSpec): MockComponentTree {
  const heading = textAtom("Payment Heading", "Approval method", d.contentW, 28, d.projectType === "mobile" ? 18 : 22, 900, INK);
  const methods = [
    chipAtom("Payment Chip - Manager", "Manager", d.projectType === "mobile" ? 92 : 116, d.chipH, "#111827", WHITE),
    chipAtom("Payment Chip - Finance", "Finance", d.projectType === "mobile" ? 118 : 148, d.chipH, "#FDE047", INK),
    chipAtom("Payment Chip - Board", "Board", d.projectType === "mobile" ? 112 : 140, d.chipH, "#22D3EE", INK),
  ];

  return component(
    "Payment Methods",
    "Pattern",
    [heading, ...methods],
    stack("Payment Methods", [
      heading.tree,
      frame("payment-row", d.contentW, d.chipH, "transparent", methods.map((method) => method.tree), {
        flex: "row",
        gap: d.projectType === "mobile" ? 8 : 10,
      }),
    ], { gap: 10, bg: COLORS.payment, rounded: d.radius, p: d.projectType === "mobile" ? 12 : 16 }),
  );
}

function createMobileCart(
  d: DeviceSpec,
  headingText: string,
  totalText: string,
  ctaText: string,
  withStepper = false,
): MockComponentTree {
  const ctaW = d.projectType === "mobile" ? 108 : 144;
  const stepperW = withStepper ? (d.projectType === "mobile" ? 74 : 96) : 0;
  const summaryW = Math.max(94, d.contentW - ctaW - stepperW - 56);
  const summary = simpleBlock("Cart Summary", "Atom", summaryW, d.cartH - 22, "#1F2937", [
    text(headingText, summaryW - 16, 18, 11, 800, "#CBD5E1"),
    text(totalText, summaryW - 16, 26, d.projectType === "mobile" ? 19 : 22, 950, WHITE),
  ], { rounded: 16, justify: "center", gap: 4, px: 8 });

  const stepper = withStepper
    ? simpleBlock("Quantity Stepper", "Pattern", stepperW, d.projectType === "mobile" ? 38 : 42, "#334155", [
        text("-", 18, 20, 16, 950, WHITE),
        text("1", 18, 20, 13, 900, WHITE),
        text("+", 18, 20, 16, 950, WHITE),
      ], { rounded: 999, flex: "row", justify: "center", items: "center", gap: 8 })
    : null;

  const cta = buttonAtom("Checkout CTA", ctaText, ctaW, d.projectType === "mobile" ? 40 : 44, "#FDE047", INK);

  return component(
    "Mobile App Cart",
    "Overlay",
    [summary, ...(stepper ? [stepper] : []), cta],
    frame("Mobile App Cart", d.contentW, d.cartH, COLORS.cart, [
      summary.tree,
      ...(stepper ? [stepper.tree] : []),
      cta.tree,
    ], {
      rounded: d.radius + 2,
      flex: "row",
      justify: "between",
      items: "center",
      px: d.projectType === "mobile" ? 12 : 18,
    }),
  );
}

function metricCard(
  d: DeviceSpec,
  name: string,
  label: string,
  value: string,
  color: string,
): MockComponentTree {
  const image = simpleBlock(`${name} Image`, "Atom", d.cardW - 24, d.projectType === "mobile" ? 72 : 82, color, [
    shape("ellipse", d.projectType === "mobile" ? 36 : 44, d.projectType === "mobile" ? 36 : 44, "#FFFFFFAA"),
    shape("rectangle", d.projectType === "mobile" ? 58 : 90, 18, COLORS.logo, { rounded: 999 }),
  ], { rounded: 18, justify: "center", items: "center", gap: 8 });
  const title = textAtom(`${name} Title`, label, d.cardW - 24, 22, d.projectType === "mobile" ? 13 : 15, 850, INK);
  const price = textAtom(`${name} Price`, value, d.cardW - 24, 26, d.projectType === "mobile" ? 19 : 22, 950, INK);

  return component(
    name,
    "Pattern",
    [image, title, price],
    frame(name, d.cardW, d.cardH, WHITE, [image.tree, title.tree, price.tree], {
      rounded: d.radius,
      stroke: LINE,
      gap: d.projectType === "mobile" ? 8 : 10,
      p: 12,
    }),
  );
}

function resultRow(
  d: DeviceSpec,
  name: string,
  titleLabel: string,
  metaLabel: string,
  valueLabel: string,
  color: string,
): MockComponentTree {
  const thumb = simpleBlock(`${name} Thumb`, "Atom", d.projectType === "mobile" ? 72 : 92, d.rowH - 18, color, [
    shape("ellipse", 32, 32, "#FFFFFFAA"),
  ], { rounded: 18, justify: "center", items: "center" });
  const copyW = Math.max(120, d.contentW - (d.projectType === "mobile" ? 178 : 230));
  const copy = simpleBlock(`${name} Copy`, "Atom", copyW, d.rowH - 24, "#EFF6FF", [
    text(titleLabel, copyW - 10, 22, d.projectType === "mobile" ? 14 : 17, 900, INK),
    text(metaLabel, copyW - 10, 34, d.projectType === "mobile" ? 11 : 12, 700, MUTED),
  ], { rounded: 12, justify: "center", gap: 5, px: 6 });
  const value = buttonAtom(`${name} Price`, valueLabel, d.projectType === "mobile" ? 76 : 98, 38, "#111827", WHITE);

  return component(
    name,
    "Pattern",
    [thumb, copy, value],
    frame(name, d.contentW, d.rowH, COLORS.results, [
      frame(`${name} left`, copyW + thumb.tree.props.w as number + 12, d.rowH - 16, "transparent", [thumb.tree, copy.tree], {
        flex: "row",
        gap: d.projectType === "mobile" ? 10 : 14,
        items: "center",
      }),
      value.tree,
    ], {
      rounded: d.radius,
      stroke: LINE,
      flex: "row",
      justify: "between",
      items: "center",
      px: d.projectType === "mobile" ? 9 : 14,
    }),
  );
}

function optionRow(
  d: DeviceSpec,
  name: string,
  label: string,
  value: string,
): MockComponentTree {
  const rowH = d.projectType === "mobile" ? 48 : 58;
  const copy = simpleBlock(`${name} Copy`, "Atom", Math.max(150, d.contentW - 120), rowH - 12, "#E0F2FE", [
    text(label, Math.max(130, d.contentW - 150), 20, d.projectType === "mobile" ? 13 : 15, 850, INK),
    text(value, Math.max(130, d.contentW - 150), 18, 11, 800, MUTED),
  ], { rounded: 12, justify: "center", gap: 2, px: 8 });
  const select = chipAtom(`${name} Select`, "Edit", d.projectType === "mobile" ? 76 : 92, d.projectType === "mobile" ? 32 : 36, "#111827", WHITE);

  return component(
    name,
    "Pattern",
    [copy, select],
    frame(name, d.contentW, rowH, COLORS.options, [copy.tree, select.tree], {
      rounded: 18,
      stroke: LINE,
      flex: "row",
      justify: "between",
      items: "center",
      px: d.projectType === "mobile" ? 10 : 14,
    }),
  );
}

function formField(
  d: DeviceSpec,
  name: string,
  label: string,
  value: string,
): MockComponentTree {
  const labelBlock = textAtom(`${name} Label`, label, d.contentW - 56, 18, 12, 850, INK);
  const input = simpleBlock(`${name} Input`, "Atom", d.contentW - 56, d.projectType === "mobile" ? 34 : 38, "#FFFFFF", [
    text(value, d.contentW - 72, 20, 12, 700, MUTED),
  ], { rounded: 14, stroke: LINE, justify: "center", px: 10 });

  return component(
    name,
    "Atom",
    [labelBlock, input],
    stack(name, [labelBlock.tree, input.tree], {
      gap: 5,
      w: d.contentW - 32,
      h: d.formFieldH,
    }),
  );
}

function chipAtom(
  name: string,
  label: string,
  w: number,
  h: number,
  bg: string,
  color: string,
): MockComponentTree {
  return simpleBlock(name, "Atom", w, h, bg, [
    text(label, Math.max(20, w - 16), h - 10, 12, 850, color),
  ], { rounded: 999, justify: "center", items: "center", px: 8 });
}

function buttonAtom(
  name: string,
  label: string,
  w: number,
  h: number,
  bg: string,
  color: string,
): MockComponentTree {
  return simpleBlock(name, "Atom", w, h, bg, [
    text(label, Math.max(20, w - 18), h - 12, 12, 900, color),
  ], { rounded: 999, justify: "center", items: "center", px: 9 });
}

function textAtom(
  name: string,
  label: string,
  w: number,
  h: number,
  size: number,
  weight: number,
  color: string,
): MockComponentTree {
  return simpleBlock(name, "Atom", w, h, "transparent", [
    text(label, w, h, size, weight, color),
  ]);
}

function simpleBlock(
  name: string,
  kind: ComponentKind,
  w: number,
  h: number,
  bg: string,
  children: TreeNode[],
  options: BlockOptions = {},
): MockComponentTree {
  return component(
    name,
    kind,
    [],
    frame(name, w, h, bg, children, options),
  );
}

function frame(
  name: string,
  w: number,
  h: number | undefined,
  bg: string,
  children: TreeNode[],
  options: BlockOptions = {},
): TreeNode {
  return node("frame", {
    name,
    w,
    h,
    bg,
    flex: options.flex ?? "col",
    gap: options.gap ?? 0,
    rounded: options.rounded ?? 0,
    justify: options.justify,
    items: options.items,
    px: options.px ?? options.p,
    py: options.py ?? options.p,
    stroke: options.stroke,
    strokeWidth: options.stroke ? options.strokeWidth ?? 1 : undefined,
    overflow: options.overflow,
  }, children);
}

function stack(
  name: string,
  children: TreeNode[],
  options: BlockOptions & { w?: number; h?: number; bg?: string } = {},
): TreeNode {
  return frame(name, options.w ?? inferMaxWidth(children), options.h, options.bg ?? "transparent", children, {
    flex: "col",
    ...options,
  });
}

function shape(
  type: "rectangle" | "ellipse",
  w: number,
  h: number,
  bg: string,
  props: Record<string, unknown> = {},
): TreeNode {
  return node(type, {
    name: String(props.name ?? type),
    w,
    h,
    bg,
    ...props,
  });
}

function text(
  copy: string,
  w: number,
  h: number,
  size: number,
  weight: number,
  color: string,
): TreeNode {
  return node("text", { w, h, size, weight, color }, [copy]);
}

function component(
  name: string,
  kind: ComponentKind,
  children: MockComponentTree[],
  tree: TreeNode,
): MockComponentTree {
  return { name, kind, children, tree };
}

function readLogoW(d: DeviceSpec): number {
  return d.projectType === "mobile" ? 52 : 60;
}

function readSearchW(d: DeviceSpec): number {
  return d.projectType === "mobile" ? 44 : 48;
}

function inferMaxWidth(children: TreeNode[]): number {
  return Math.max(1, ...children.map((child) => Number(child.props.w ?? child.props.width ?? 1)));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function node(
  type: string,
  props: Record<string, unknown> = {},
  children?: Array<TreeNode | string>,
): TreeNode {
  const propChildren = props.children;
  const resolvedChildren =
    children ??
    (Array.isArray(propChildren)
      ? (propChildren as Array<TreeNode | string>)
      : propChildren !== undefined
        ? [propChildren as TreeNode | string]
        : []);
  const rest = { ...props };
  delete rest.children;
  Object.keys(rest).forEach((key) => {
    if (rest[key] === undefined) delete rest[key];
  });
  return { type, props: rest, children: resolvedChildren };
}

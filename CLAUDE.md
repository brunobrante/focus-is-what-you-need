# AGENTS.md

## Runtime And Tooling

Default to Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun test` instead of `jest` or `vitest`.
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`.
- Use `bun install` instead of `npm install`, `yarn install`, or `pnpm install`.
- Use `bun run <script>` instead of `npm run <script>`, `yarn run <script>`, or `pnpm run <script>`.
- Use `bunx <package> <command>` instead of `npx <package> <command>`.
- Bun loads `.env` automatically, so do not add `dotenv`.

When touching app APIs, prefer Bun-native primitives:

- `Bun.serve()` instead of `express`
- `bun:sqlite` instead of `better-sqlite3`
- `Bun.redis` instead of `ioredis`
- `Bun.sql` instead of `pg` or `postgres.js`
- built-in `WebSocket` instead of `ws`
- `Bun.file` instead of `fs.readFile` and `fs.writeFile` where practical

## Core Product Idea

This project is not just a gallery of screens and it is not just a flat component library.

The core idea is a screen-first component explorer built from mocked data, where each screen is the source of truth and every component is derived from that screen's visual hierarchy.

The system should let someone start from a complete screen, understand every meaningful child inside it, click deeper into any child, and keep drilling down while always preserving the parent-child relationship that explains where that component came from.

In short:

- screens are the starting point
- components are extracted from screens
- children are extracted from components
- every preview is a snapshot of the real bounds of that exact node
- the hierarchy matters more than a generic design-system categorization

## Mental Model

Think of each mocked screen as a tree.

A screen is the root node.
Its direct UI sections are child components.
Those sections can contain their own children.
Those children can contain smaller children again.

The user should be able to navigate that tree visually.

Example mental model:

- `Home` is a screen
- `Header`, `Hero Banner`, `Category Strip`, `Featured List`, and `Mobile App Cart` are direct children of `Home`
- `Header` contains `Logo Image`, `Header Copy`, and `Search Button`
- `Featured List` contains product cards
- each product card contains an image, title, price, and so on

This means the product is effectively a visual decomposition tool:

1. start from the whole screen
2. split the screen into meaningful child components
3. let each child be previewed on its own
4. let each child reveal its own children
5. never lose the ancestry back to the father screen

`father` here means `parent`.
The parent relationship is not optional metadata. It is the main structure of the product.

## What Must Always Be True

### 1. The screen is the source of truth

Components should not be invented in isolation first and attached later.
They should come from a specific screen or from a specific parent component inside a screen.

If a component exists, it should be possible to answer:

- which screen did it come from?
- who is its immediate parent?
- what are its immediate children?

If those questions cannot be answered, the structure is too generic and no longer matches the intent of this project.

### 2. Every component must preserve hierarchy

Each component must belong to its father.
Each child must keep its parent relationship.
Each screen must expose its direct children.

This is more important than naming things as `Layout`, `Atom`, `Pattern`, or `Section`.
Those labels can help, but the hierarchy is the real truth.

### 3. The same hierarchy should drive all views

The same mocked hierarchy should feed:

- screen previews
- component detail previews
- child component lists
- seed data
- mock canvas scenes
- navigation between screen and component detail pages

There should not be one fake structure for previews and another unrelated structure for stored mock data.
The hierarchy should be defined once and reused everywhere.

### 4. Snapshot size must come from the node itself

This is a non-negotiable rule.

Snapshots must use the intrinsic size of the node being previewed.
Do not force everything into a generic preview ratio such as `4:3`.
Do not crop a component into an arbitrary card if that changes its meaning.

Examples:

- if a mobile screen is `390x844`, its snapshot must be `390x844`
- if a header is `342x72`, its snapshot must be `342x72`
- if a cart bar is `342x88`, its snapshot must be `342x88`
- if a product card is `150x184`, its snapshot must be `150x184`

The point of the snapshot is to represent the actual component, not a normalized placeholder.

### 5. Mock content should be realistic enough to communicate structure

The mock data should not be empty boxes with vague labels if the screen clearly implies richer structure.
Each screen and component should include believable content such as:

- header text
- logo image block
- search controls
- CTA labels
- product names
- prices
- helper copy
- filter chips
- list rows
- summary text
- form fields
- payment methods
- cart totals

The goal is not realism for its own sake.
The goal is to make the hierarchy legible and the preview understandable immediately.

### 6. Components are screen-derived, not detached design tokens

This project does not start from a pure design-system mindset where a generic component exists independently of context.

Instead, a component here is primarily:

- a piece of a real screen
- with a known parent
- with known children
- with enough data to render a believable snapshot

It is acceptable for the same conceptual pattern to exist in different screens with different content if that helps preserve the screen-first truth.

## Required Interaction Behavior

### Screen click behavior

When the user opens or clicks a screen such as `Home`, the preview must show the complete screen snapshot with all its visible children already included.

That means:

- the screen snapshot is a whole composition
- it represents the full screen, not one isolated component
- the user should be able to understand the layout and the child sections from this single preview

### Component click behavior

When the user clicks a component inside that screen, the UI should transition to that component as the selected subject.

At that point:

- the main preview should show only that component's own snapshot
- the snapshot must keep the component's real dimensions
- the child components contained inside that component should be shown adjacent to it in the side panel or child list
- those child components should themselves be openable

So the browsing model is:

- whole screen first
- one selected child next
- that child's children beside it
- then repeat

### Child adjacency behavior

When a selected node has children, those children should appear as siblings in the surrounding inspector or grid, adjacent to the currently selected item in the UI flow.

The important point is that the selected node is not shown mixed back into the full screen.
It is shown on its own, while its contained children are available nearby for continued navigation.

## Canvas Editing And Storage

Every screen and every component that can be opened in the canvas must have exactly one editable scene for its current subject.

The canvas subject is not the whole original tree by default.
It is the thing the user opened:

- opening a screen edits the screen scene
- opening `Header` edits the `Header` variant scene
- opening `Logo Design` edits the `Logo Design` variant scene

Inside that canvas scene, the first rendered subject element is the locked centered root for that subject.
For a full mobile screen, this may be the screen body at `390x844`.
For a component, this must be the component root itself, for example the `Header` background at `342x72`, not the original phone body.

This means the locked root is relative to the opened subject, not relative to the original full screen tree.
If the user opens a component, the canvas must not secretly render the full screen and then select a nested node.
It must render the component as its own scene, using its own bounds.

### Canvas zoom behavior

The canvas is not an infinite workspace.
There is no infinite horizontal or vertical panning area around the subject.
The editable area is the subject that was opened: the screen or the component variant scene.

Zoom must respect that model:

- the minimum user zoom is `1x` (`100%`)
- users must not be able to zoom out below `1x`
- zooming and panning must stay clamped to the opened subject's bounds
- the maximum user zoom is `25x` (`2500%`)

Opening a full screen should start at `1x` user zoom.
At `1x`, one document pixel maps to one CSS pixel — the projection is independent of the browser window size. If the screen is larger than the visible canvas area, the screen overflows and the user pans to see the rest. The browser window is purely a clipping rectangle: resizing it changes what's visible but never recomputes the canvas projection. This is what keeps the selection outline glued to its element while the window is being resized.

Opening a component should calculate the initial zoom from that component's own intrinsic size.
Small components must not open as tiny `1x` objects.
For example, a `60x60` component can open around `5x` (`500%`) because the subject is small enough to inspect comfortably while still being bounded by its own scene.

This initial zoom must be based on the opened subject's width and height, not on generic project type, component kind, arbitrary preview ratios, or the original parent screen size.

Snapshots keep their intrinsic source dimensions, but component snapshots shown in previews may be visually scaled using the same subject-size zoom logic so small components are legible.
This visual scaling must not rewrite the snapshot dimensions, crop the image, distort the aspect ratio, or imply that the component itself has different bounds.

### Storage ownership

Storage follows the same hierarchy as the UI:

- screen scenes are stored with `ownerType: "screen"` and the screen id
- component scenes are stored with `ownerType: "variant"` and the component's active variant id
- a top-level component belongs to its source screen through `screenId`
- a nested component belongs to its parent component through `parentVariantId`
- every component owns an `activeVariantId`, and that variant owns the editable canvas scene

Do not store component canvas scenes under component ids.
Variants are the editable scene owners for components.

### Snapshot propagation

Snapshots are derived from scenes.
They should not be manually maintained as disconnected mock images once a scene exists.

When a component variant scene is saved, the storage layer must:

1. update that variant's scene
2. regenerate that variant's thumbnail from the scene graph
3. replace the matching subtree inside its parent scene
4. regenerate the parent thumbnail
5. continue upward until the source screen thumbnail has been regenerated

Example:

- editing `Logo Design` updates the `Logo Design` snapshot
- the `Logo Design` subtree is replaced inside `Header`
- the `Header` snapshot updates
- the `Header` subtree is replaced inside `Home`
- the `Home` screen snapshot updates

This propagation is required because parent previews are visual compositions of their children.
If a child component changes but the parent snapshot still shows the old child, the hierarchy is broken.

Schema migrations should also be used when needed to repair older local storage rows whose scenes and thumbnails were created before connected snapshot propagation existed.

## Data Modeling Rules

When defining mock data, the minimum useful unit is:

- node name
- node kind
- parent relationship
- children
- content data needed to render the preview

This means a component record should conceptually answer:

- `name`: what this node is
- `kind`: what type of component it is
- `parent`: which screen or component owns it
- `children`: which nodes are directly inside it
- `preview data`: the text, images, colors, shapes, and layout information needed to render it

Do not create orphan components with no parent unless the product explicitly evolves to support truly global shared nodes later.
For the mocked experience, the safer assumption is that every important node is born inside a screen tree.

## Screen Decomposition Guidelines

When decomposing a mocked screen, split by meaningful UI ownership, not by microscopic DOM fragments.

Good direct children:

- `Header`
- `Hero Banner`
- `Search Bar`
- `Filter Chips`
- `Featured List`
- `Product Results`
- `Product Gallery`
- `Product Summary`
- `Options List`
- `Shipping Form`
- `Payment Methods`
- `Mobile App Cart`

Good nested children inside those:

- `Logo Image`
- `Header Copy`
- `Search Button`
- `Primary CTA`
- `Product Card`
- `Product Card Image`
- `Product Card Title`
- `Product Card Price`
- `Field Label`
- `Field Input`
- `Checkout CTA`

Avoid making the first decomposition level too tiny.
For example, `H1 text`, `left padding`, or `single icon` should usually not be top-level screen children unless they are independently meaningful in the product.

## Canonical Example Trees

These examples express the intent better than abstract rules alone.

### Home

- `Home` screen
- `Header`
- `Hero Banner`
- `Category Strip`
- `Featured List`
- `Mobile App Cart`

### Home > Header

- `Header`
- `Logo Image`
- `Header Copy`
- `Search Button`

### List

- `Listagem` screen
- `Header`
- `Search Bar`
- `Filter Chips`
- `Product Results`
- `Mobile App Cart`

### Detail

- `Detalhe` screen
- `Header`
- `Product Gallery`
- `Product Summary`
- `Options List`
- `Mobile App Cart`

### Checkout / Mobile App Cart Flow

- `Formulário` or checkout-like screen
- `Header`
- `Shipping Form`
- `Payment Methods`
- `Mobile App Cart`

The important part is not the exact naming.
The important part is that each screen can be decomposed into a clear, navigable tree and every node can be previewed independently.

## What To Avoid

- do not treat the app as a random mock gallery with no hierarchy
- do not flatten all components into one unrelated library
- do not lose the link between a component and its father screen
- do not crop component previews into arbitrary ratios
- do not use empty placeholder boxes when the mock should communicate real structure
- do not define one hierarchy for storage and a different one for the UI
- do not decompose screens so aggressively that the tree becomes noisy and useless
- do not create component previews that secretly still depend on showing the whole screen

## Definition Of Success

The product is correct when a new person can open it and immediately understand:

- what the full screen looks like
- which major children exist inside that screen
- how to click into one child and isolate it
- how to see that child at its own true size
- how to continue into the next child level
- how every node remains anchored to the same original screen hierarchy

If a reader or user can say:

`I can start at Home, inspect the whole screen, click Header, see Header alone, then inspect Logo Image and Header Copy without losing context`

then the product is aligned with the intended idea.

## Reusable Prompt For Future Chats

Use the block below when you want to explain this project to another model or another collaborator:

```md
This project is a screen-first component explorer built from mocked data.

The source of truth is the screen, not a flat component library. Each mocked screen must be decomposed into a meaningful parent-child tree. A screen is the root node, its direct sections are child components, and those components can contain smaller children. Every node must preserve its father/parent relationship.

The interaction model is:
- opening a screen shows the full screen snapshot with all of its children already visible inside it
- clicking a component inside that screen shows only that component's own snapshot
- the selected component's children are shown adjacent to it so the user can keep drilling down

Snapshot sizing is critical:
- the snapshot must use the real bounds of the node itself
- a mobile screen should keep its exact device size, for example `390x844`
- a header, cart bar, card, or form block should keep its own intrinsic width and height
- do not force components into a generic `4:3` preview or crop them arbitrarily

Canvas and preview zoom should make small components legible without changing their real bounds:
- the canvas is not infinite and cannot pan endlessly
- the minimum user zoom is `1x`, and zoom-out below `100%` is not allowed
- the maximum user zoom is `25x` (`2500%`)
- full screens open at `1x` user zoom — one document pixel maps to one CSS pixel
- the canvas projection is independent of the browser window size: resizing the window only changes the visible clipping area, never the zoom or offset; if the document is larger than the window, it overflows and the user pans to see the rest
- components open with an initial zoom calculated from the component's own width and height
- component snapshots may be visually scaled in previews using the same size-based zoom logic, while still preserving the snapshot's intrinsic dimensions

Mock content should be realistic enough to communicate the structure: header text, logo image blocks, search controls, product names, prices, filters, summary text, form fields, payment methods, cart totals, and CTA labels.

The same mocked hierarchy should drive the seed data, previews, navigation, and stored component tree. Do not create one fake hierarchy for previews and a different one for the actual mock data.

Every editable component should have one canonical current variant scene. Editing that component updates that scene, then all connected parent snapshots are regenerated from the changed subtree.

The main goal is visual decomposition with preserved ancestry: start from the whole screen, click into a child, see that child alone at the correct size, inspect its children, and always keep the link back to the original screen.
```

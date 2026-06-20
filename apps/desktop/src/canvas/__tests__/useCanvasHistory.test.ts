import { test, expect } from "bun:test";

import { createDefaultHtmlCanvasDocument } from "@/lib/canvas/htmlScene";
import { sameDocumentShape } from "@/canvas/useCanvasHistory";

function baseDocument() {
  return createDefaultHtmlCanvasDocument({
    name: "Test",
    projectType: "desktop",
    targetKind: "screen",
  });
}

test("sameDocumentShape ignores updatedAt", () => {
  const a = baseDocument();
  const b = { ...a, updatedAt: a.updatedAt + 5000 };
  expect(sameDocumentShape(a, b)).toBe(true);
});

test("sameDocumentShape ignores node key order", () => {
  const a = baseDocument();
  // Rebuild each node with its keys in reverse insertion order; same content.
  const b = {
    ...a,
    nodes: a.nodes.map((node) =>
      Object.fromEntries(Object.entries(node).reverse()) as typeof node,
    ),
  };
  expect(sameDocumentShape(a, b)).toBe(true);
});

test("sameDocumentShape detects a node bounds change", () => {
  const a = baseDocument();
  const b = {
    ...a,
    updatedAt: a.updatedAt + 1,
    nodes: a.nodes.map((node, index) =>
      index === 0 ? { ...node, bounds: { ...node.bounds, x: node.bounds.x + 1 } } : node,
    ),
  };
  expect(sameDocumentShape(a, b)).toBe(false);
});

test("sameDocumentShape detects a nested style change", () => {
  const a = baseDocument();
  const b = {
    ...a,
    nodes: a.nodes.map((node, index) =>
      index === 0 ? { ...node, style: { ...node.style, background: "#ff00aa" } } : node,
    ),
  };
  expect(sameDocumentShape(a, b)).toBe(false);
});

test("sameDocumentShape detects an added node", () => {
  const a = baseDocument();
  const b = { ...a, nodes: [...a.nodes, { ...a.nodes[0], id: "node-extra" }] };
  expect(sameDocumentShape(a, b)).toBe(false);
});

test("sameDocumentShape detects a removed node", () => {
  const a = baseDocument();
  const b = { ...a, nodes: a.nodes.slice(0, -1) };
  expect(sameDocumentShape(a, b)).toBe(false);
});

# Screen Simulator Overlay

Overlay visual no canvas que simula o tamanho e posição da screen pai enquanto o usuário edita um componente isolado.

## O que faz

Quando o canvas está renderizando um **componente** (não uma screen), aparece no canto inferior esquerdo um botão com ícone de dispositivo (smartphone ou monitor, conforme o `projectType`). Ao ativar, um retângulo translúcido aparece no stage representando a screen real — dimensões, border-radius e tudo — sem qualquer efeito no documento, sem interação, puramente visual.

O botão ao lado (chevron ↑) abre um pequeno menu com dois modos de exibição:

| Modo | Ícone | Comportamento |
|---|---|---|
| **Centralizado** | quadrado centrado na tela | overlay centralizado ao redor do componente |
| **Local original** | barra no topo da tela | componente posicionado no lugar exato que ocupa dentro da screen pai, viewport pana para mostrar o contexto |

## UI

```
CanvasRender.tsx → SurfaceCanvasControls
  ├── DeviceSwitch         (botão mobile/desktop — toggle do overlay)
  ├── ScreenOverlayMenuToggle   (chevron ↑ — abre o menu)
  └── ScreenAlignmentMenu  (popup com AlignmentOption × 2)
```

O botão só é renderizado quando `isComponent === true`. Quando a screen está aberta, o grupo não aparece.

O estado do overlay (`screenOverlayEnabled`, `screenOverlayAlignment`) vive em `CanvasSurface` e é resetado para o default sempre que `storageKey` muda (ou seja, ao trocar de subject).

## Fluxo de dados

### 1. Posição do componente na screen

`ComponentRow.sourceNodeId` é o ID do nó na cena pai que corresponde a este componente. É o mesmo link que o sistema de snapshot propagation usa para substituir subtrees.

```
Canvas.tsx
  component.parentVariantId → useScene("variant", id)
  component.screenId        → useScene("screen", id)
  ↓
  parentScene.graphJSON
  ↓
  getNodeAbsoluteBoundsInGraph(graphJSON, component.sourceNodeId)
  → { x, y, width, height }
```

`getNodeAbsoluteBoundsInGraph` (exportado de `htmlSceneAdapter.ts`):
- Parseia o graphJSON com `htmlCanvasDocumentFromJSON`
- Encontra o nó alvo pelo ID
- Sobe a cadeia de `parentId` acumulando `bounds.x + bounds.y` de cada ancestral até chegar na raiz

Os `bounds` no grafo são posições absolutas dentro do sistema de coordenadas do pai imediato — não são afetados por flex do CSS porque o canvas sempre persiste coordenadas absolutas calculadas no momento do save.

Resultado: `componentOriginPosition: { x, y } | null`

Se `sourceNodeId` for null (componente antigo sem esse campo), `componentOriginPosition` é null e o modo "local original" cai para `(0, 0)`.

### 2. Propagação de props

```
Canvas.tsx
  → CanvasRender   (isComponent, componentOriginPosition)
    → CanvasSurface  (mesmos)
      → screenOverlay = { width, height, borderRadius, alignment, originPosition }
        → CanvasStage  (screenOverlay)
          → ScreenBoundsOverlay  (renderização)
          → useEffect pan       (viewport)
```

### 3. Dimensões da screen

Derivadas de `canvasSizeForProjectType(projectType)`:

```
mobile  → 390 × 844
tablet  → 820 × 1180
desktop → 1440 × 900
```

São as dimensões padrão do tipo de projeto, não as de uma screen específica.

## Renderização do overlay

`ScreenBoundsOverlay` é um `div` com `position: absolute` renderizado **antes** do `canvas-stage` dentro do `stage-space`, ou seja, fica atrás do conteúdo editável. O `stage-space` não tem `overflow: hidden`, então o overlay pode se estender além dos limites do componente sem ser clipado (a clipagem acontece no `canvas-shell` que representa o viewport).

### Modo centralizado

```
left = ((canvasWidth  - screenWidth)  / 2) * renderScale
top  = ((canvasHeight - screenHeight) / 2) * renderScale
```

O componente fica visualmente no centro da tela simulada.

### Modo local original

```
left = -(originPosition.x) * renderScale
top  = -(originPosition.y) * renderScale
```

O overlay recua para que o componente apareça em `(originX, originY)` dentro dele.

## Viewport pan (modo local original)

Posicionar o overlay com offset negativo coloca a screen nos lugares certos matematicamente, mas visualmente o **overlay se move** enquanto o componente fica fixo. O usuário quer ver o componente se mover para dentro da tela.

A solução: quando o alinhamento muda para "origin", o viewport pana na direção oposta:

```typescript
// ao ativar "origin"
dispatch({
  type: "setViewport",
  offsetX: offsetX + originX * displayZoom,
  offsetY: offsetY + originY * displayZoom,
});

// ao desativar / trocar para "center"
dispatch({
  type: "setViewport",
  offsetX: offsetX - originX * displayZoom,
  offsetY: offsetY - originY * displayZoom,
});
```

O pan é `+originX * displayZoom` (para a direita/baixo). O overlay, que está em `-originX * renderScale` no stage-space, termina na posição onde o componente estava antes do pan. O componente aparece deslocado para `(originX, originY)` dentro da tela. Efeito visual: o componente "saltou" para seu lugar na screen.

O valor do pan aplicado é salvo em `originPanRef` (em unidades de documento) para ser revertido exatamente ao sair do modo.

**Limitação conhecida:** se o usuário mudar o zoom enquanto está no modo "origin" e depois trocar de alinhamento, o `displayZoom` usado na reversão será diferente do aplicado. A imprecisão é pequena na prática, mas existe.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `canvas/engine/htmlSceneAdapter.ts` | Exporta `getNodeAbsoluteBoundsInGraph` |
| `canvas/Canvas.tsx` | Carrega cena pai, computa `componentOriginPosition`, passa para `CanvasRender` |
| `canvas/shell/CanvasRender.tsx` | Tipos `ScreenOverlay` / `ScreenOverlayAlignment`, UI do botão + menu, estado do overlay em `CanvasSurface` |
| `canvas/stage/CanvasStage.tsx` | `ScreenBoundsOverlay`, `useEffect` de viewport pan |

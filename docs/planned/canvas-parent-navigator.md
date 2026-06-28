# Canvas — Parent Navigator (floating button)

Status: **idea** — not yet designed or scheduled.

## Problema

Ao editar um componente específico no canvas, não há como acessar rapidamente o
componente pai para fazer ajustes contextuais sem sair do fluxo de edição.

## Ideia

Adicionar um botão flutuante no canvas (próximo ao elemento selecionado ou em uma
barra de contexto) que permite navegar até o pai do componente atual e editá-lo
diretamente — sem perder o contexto de onde se estava.

Casos de uso principais:
- Selecionar um filho e querer ajustar o layout/estilo do pai imediatamente
- "Subir" na árvore de componentes de forma rápida enquanto edita

## O que decidir quando for implementar

- Posição do botão (flutuante junto à seleção vs. barra de contexto no topo do canvas)
- Quantos níveis de pai expor (só o pai direto ou breadcrumb de ancestrais)
- Se "editar pai" abre em isolamento ou apenas seleciona no canvas atual
- Interação com o modo de edição de componente já existente

Nada definido ainda. Detalhar quando o fluxo de edição de componentes estiver mais maduro.

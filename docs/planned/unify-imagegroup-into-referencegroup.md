# Unify imageGroup into ReferenceGroup

## Objetivo

Eliminar o conceito de `imageGroup` (pseudo-grupo) e fazer com que toda
coleção — seja 2 imagens ou 1 imagem com 2+ screens — use a mesma entidade
`ReferenceGroup`. Cada camada tem nome independente:

| Camada | Entidade | Campo |
|---|---|---|
| Grupo | `ReferenceGroup` | `group.name` |
| Original | `ReferenceItem` | `item.name` |
| Screen | `ReferenceStackRoot` | `data.roots[i].name` |

---

## Por que o problema existe hoje

Quando uma imagem recebe uma segunda screen no builder, nenhum
`ReferenceGroup` é criado. A modal de detalhes detecta `stack.rootCount > 1`
e ativa um flag `imageGroup = true`, que muda o painel "Group" para mostrar
`ImageGroupDetails` — um componente que edita `item.name` como se fosse o
nome do grupo. Resultado: `item.name` serve tanto de nome do original quanto
de nome do grupo.

---

## O que NÃO muda

- O tipo `ReferenceGroup` — já está correto.
- A lógica de persistência de grupos (`replaceReferenceLibraryGroups`).
- O builder — não precisa saber sobre grupos.
- `References.tsx` — items com `groupId` já são ocultados da grid e o card
  do grupo já aparece no lugar.
- `GroupDetails` — já funciona para qualquer grupo; o nome é editável pelo
  botão "Edit" (dialog existente).
- `GroupDialogs` — nenhuma mudança.

---

## Plano passo a passo

### Passo 1 — Auto-criar `ReferenceGroup` para itens com múltiplos roots

**Arquivo:** `src/routes/references/hooks/useReferenceLibrary.ts`

Após o `loadReferenceLibrary()` resolver, e também num `useEffect` que
observa mudanças em `library`, executar uma normalização:

```
for each item where (item.stack?.rootCount ?? 1) > 1 && !item.groupId:
  1. Criar ReferenceGroup:
       id: newReferenceGroupId()
       name: item.name          ← nome inicial = nome do original
       referenceIds: [item.id]
       coverReferenceId: item.id
       createdAt / updatedAt: now
  2. Atualizar item: { ...item, groupId: group.id }
  3. Persistir: replaceReferenceLibraryMeta + replaceReferenceLibraryGroups
```

Isso cobre:
- Migração de dados existentes (na primeira carga)
- Itens que ganham segunda screen enquanto o usuário está no builder
  (normalizados na próxima visita ao References)

**Cuidado:** a normalização deve ser idempotente — nunca criar grupo duplicado
para um item que já tem `groupId`.

---

### Passo 2 — Remover `imageGroup` de `ReferenceDetailModal`

**Arquivo:** `src/routes/references/components/ReferenceDetailModal.tsx`

Remover:
- Linha 82–84: `const isImageGroup = ...`
- Linha 415: prop `imageGroup={isImageGroup}` passada para `DetailPanel`

Nada mais muda aqui — o modal já abre como `{ kind: "group" }` via o card do
grupo (que existe agora graças ao Passo 1).

---

### Passo 3 — Remover `imageGroup` de `DetailPanel`

**Arquivo:** `src/routes/references/components/DetailPanel.tsx`

Remover:
1. `imageGroup = false` do destructuring de props
2. `imageGroup?: boolean` da interface de props
3. `const hasGroupTab = Boolean(group) || imageGroup` → `Boolean(group)`
4. Branch `tab === "group" && imageGroup && item ? <ImageGroupDetails .../>` 
5. Branch no footer `tab === "group" && imageGroup && item ? (...)` (ações Builder + Remove)
6. Função `ImageGroupDetails` inteira (linhas 394–443)

Após a remoção, o tab "Group" para uma imagem de screen única usa
`GroupDetails` normalmente — que já mostra `group.name` e o botão "Edit".

---

### Passo 4 — Ajuste visual em `GroupDetails` para grupo de 1 original

**Arquivo:** `src/routes/references/components/DetailPanel.tsx` → `GroupDetails`

Hoje mostra `["Screens", String(references.length)]` o que ficaria "Screens: 1"
para um grupo de 1 imagem. Ajustar o label:

```
["Originals", String(references.length)],
["Screens", String(stackCount)],   // stackCount = itens com stack.enabled
```

Isso vale para todos os grupos (melhora semântica geral).

A seção "Add loose screen" continua — permite mover outro original para este
grupo, o que é comportamento válido.

---

## Casos de borda a verificar após implementar

| Caso | Comportamento esperado |
|---|---|
| Item já tem `groupId` + `rootCount > 1` | Nenhum grupo novo criado (idempotente) |
| Item tem `groupId` + `rootCount = 1` | Não afetado pela normalização |
| Grupo multi-imagem onde 1 imagem tem múltiplos roots | Funciona — a imagem aparece em Originals; suas screens aparecem em Stacks |
| Deletar item único de um grupo auto-criado | O grupo fica vazio — verificar se deve ser deletado automaticamente também |
| `ReferenceCard` com badge de screen count | `item.stack?.rootCount` ainda existe, badge continua funcionando |
| Nome do grupo auto-criado | Começa como `item.name`; editável independentemente via "Edit" dialog |
| Renomear o original após grupo criado | `item.name` muda; `group.name` não é afetado |

---

## Ordem de execução

1. Passo 1 (normalização) — sem tocar na UI, verificar que grupos são criados corretamente
2. Passo 2 + 3 (remover imageGroup) — uma vez que a normalização está ok
3. Passo 4 (ajuste de label) — cosmético, pode ir junto com o Passo 3
4. Verificar todos os casos de borda da tabela acima
5. Um commit por passo

---

## Arquivos envolvidos

```
src/routes/references/hooks/useReferenceLibrary.ts   ← Passo 1
src/routes/references/components/ReferenceDetailModal.tsx  ← Passo 2
src/routes/references/components/DetailPanel.tsx     ← Passos 3 e 4
```

Nenhum outro arquivo precisa mudar.

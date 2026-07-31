# Navegação por teclado/D-pad no grid de canais

## Contexto

O projeto se posiciona como "TV-friendly" (ver redesign visual em
`docs/superpowers/specs/2026-07-30-tv-redesign-design.md`), mas hoje a
interação depende inteiramente de mouse/touch — só `ProfileManager.tsx` usa
`onKeyDown` em todo o código-fonte (`src/**/*.tsx`), e não existe navegação
espacial por seta em nenhum lugar. Isso foi identificado numa auditoria de
melhorias (performance/layout/compatibilidade/acessibilidade) feita em
2026-07-31, junto com outros achados (já corrigidos separadamente: leitura
bloqueante de arquivo no parser M3U, `minWidth`/`minHeight` da janela, lazy
loading de imagens no `SeriesView`).

Esta spec cobre só o item de maior escopo/impacto daquela auditoria:
navegação por seta (D-pad ou teclado) no grid principal de canais
(`MainScreen.tsx` → `ChannelCard.tsx`). Foi escolhido para vir antes da
migração Tailwind v4 (outro item pendente da auditoria) por ter menor risco:
é aditivo — não toca no que já existe visualmente — enquanto a migração do
Tailwind tem blast radius grande (todo arquivo `.tsx` que usa classe
utilitária, ou seja, os ~24 componentes recém-redesenhados).

## Escopo

**Dentro**: grid de canais em `MainScreen.tsx` (o `<ChannelCard>` renderizado
dentro do `rowVirtualizer`).

**Fora** (explicitamente, decidido no brainstorming):
- Modais (`PinEntryModal`, `ConfirmationModal`, `RefreshModal`, etc.)
- `SeriesView` / grid de episódios
- Favoritar via teclado (`onToggleFavorite`) — continua só mouse/touch por
  enquanto
- `SearchBar`, `CategoryBar`, `ContentTypeTabs` — navegação de/para esses
  componentes não é tratada aqui além do Tab natural do navegador

## Modelo de interação

Card inteiro como unidade de foco (não elemento-por-elemento). Setas movem um
destaque visual entre `ChannelCard`s; Enter no card focado dispara a
mesma ação do botão Play/Browse existente.

- **Seta direita/esquerda**: `focusedIndex ± 1`
- **Seta baixo/cima**: `focusedIndex ± columns` (columns vem de
  `useResponsiveGrid()`, já existente)
- **Bordas do grid**: clampa — seta que sairia do grid não faz nada (sem
  wrap-around, sem vazar foco pra fora do grid)
- **Enter** no card focado: chama `onPlay(channel)` — o mesmo callback
  que o botão Play/Stop/Browse do card já usa hoje, preservando toda a lógica
  existente de parental control / series vs live
- **Tab**: roving tabindex — só o card em `focusedIndex` tem `tabIndex={0}`,
  os demais `tabIndex={-1}`. O grid entra na ordem natural de Tab da página
  (Tab a partir da busca leva direto pro card focado)
- **Clique/toque do mouse num card**: sincroniza `focusedIndex` pra aquele
  card, mantendo mouse e teclado sempre consistentes

## Arquitetura

Novo hook `src/hooks/useGridKeyboardNav.ts`, separado de
`useKeyboardShortcuts.ts` (que trata media control global — Space/Escape/`/`
— e continua intocado; sem sobreposição de responsabilidade, já que o Space
do `useKeyboardShortcuts` controla o canal *tocando atualmente*, enquanto o
Enter deste hook age sobre o card *focado na navegação*, que podem ser canais
diferentes).

```ts
function useGridKeyboardNav(
  channels: Channel[],
  columns: number,
  onPlay: (channel: Channel) => void
): {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  cardRefs: MutableRefObject<(HTMLDivElement | null)[]>;
}
```

- `focusedIndex`: estado local (`useState`), índice dentro do array
  `channels` recebido (não linha/coluna — convertido pra linha/coluna só na
  hora de calcular o resultado da seta, mantém o estado simples)
- Reset de `focusedIndex` pra `0` num `useEffect` sempre que `channels`
  mudar de identidade/tamanho (troca de busca, categoria ou tab de conteúdo
  em `MainScreen`) — evita destaque apontando pra um canal que já saiu da
  lista filtrada
- `cardRefs`: array de refs (um por posição de card *atualmente montado*),
  usado só pra chamar `.focus()` programaticamente depois de mover
  `focusedIndex` — necessário porque o `<ChannelCard>` não é nativamente
  focável (é uma `<div>`), então o `.focus()` do DOM não acontece sozinho ao
  mudar `tabIndex`

### Integração com a virtualização

O ponto tecnicamente arriscado da spec. `MainScreen.tsx` usa
`useVirtualizer` (linhas, `overscan: 2`) — só as linhas visíveis (+ 2 de
overscan) existem no DOM. Se o usuário navegar pra um card fora da viewport
atual, o `ChannelCard` correspondente ainda não está montado, e um `.focus()`
direto falharia silenciosamente (ref nula).

Fluxo ao mover `focusedIndex` via seta:
1. Calcula a linha do novo índice: `Math.floor(focusedIndex / columns)`
2. Chama `rowVirtualizer.scrollToIndex(linha)` (API já exposta pelo
   `rowVirtualizer` existente em `MainScreen.tsx`)
3. Um `useEffect` com dependência em `focusedIndex` roda **depois** da
   virtualização re-renderizar a linha (no próximo commit do React, já que
   `scrollToIndex` dispara um re-render síncrono do virtualizer) e chama
   `cardRefs.current[focusedIndex]?.focus()`

Esse `useEffect` precisa tolerar o card ainda não estar montado no primeiro
render pós-scroll (ex: se `scrollToIndex` ainda está animando) — se
`cardRefs.current[focusedIndex]` for `null`, não faz nada silenciosamente
(sem retry infinito); na prática o `scrollToIndex` do `@tanstack/react-virtual`
é síncrono o suficiente pra isso não ser um problema observável, mas o guard
existe pra não quebrar se o comportamento da lib mudar numa versão futura.

## Visual

Anel de foco usando os tokens de cor já existentes (sem cor nova):
`ring-2 ring-accent ring-offset-2 ring-offset-bg`, aplicado ao
`<ChannelCard>` quando ele é o `focusedIndex`. Visualmente distinto do
`hover:shadow-lg` que já existe no card (foco = navegação por teclado;
hover = mouse passando por cima; os dois podem coexistir sem conflito
visual).

## Casos extremos

- **Lista vazia** (`filteredChannels.length === 0`): hook não faz nada,
  `MainScreen` já trata esse caso com uma mensagem própria antes de renderizar
  o grid
- **Uma única linha** (menos canais que `columns`): seta baixo/cima não move
  (clamp já cobre isso, não precisa de caso especial)
- **Filtro muda enquanto um card está focado**: reset pra `focusedIndex = 0`
  (coberto acima)

## Testes

`src/hooks/useGridKeyboardNav.test.ts` (Vitest, sem DOM real — testa a lógica
de índice isoladamente via `renderHook`):
- Seta direita/esquerda/cima/baixo movem `focusedIndex` corretamente dado um
  `columns` fixo
- Clamp nas 4 bordas (topo, base, esquerda, direita) — seta não move o índice
  pra fora de `[0, channels.length)`
- `channels` muda de conteúdo → `focusedIndex` reseta pra `0`
- Enter no índice focado chama `onPlay` com o canal certo

# Continue Watching auto-colapsável em telas baixas

## Contexto

A faixa "Continue Watching" (`ContinueWatchingRow`) fica sempre expandida,
ocupando altura fixa acima da sidebar de categorias e do grid de canais. Em
telas com altura reduzida (notebooks, monitores abaixo de ~1080px de altura)
isso já causou bug real: a faixa some espaço suficiente pra empurrar
categorias/grid pra fora da viewport visível (corrigido em 793e50e/c01a57a
com `min-h-0` na cadeia de flexbox, mas o espaço ocupado pela faixa em si
continua fixo).

A `CategorySidebar` já resolve um problema parecido (barra lateral disputando
espaço) com um padrão de colapso: estado local `isOpen`, colapsa pra uma rail
fina de ~14px com ícone, expande pra 240px ao clicar. Esta spec estende a
mesma ideia pro eixo horizontal (altura, não largura) da `ContinueWatchingRow`,
mas só ativa esse comportamento quando a viewport é baixa — em telas grandes
a faixa continua sempre expandida, sem nenhuma mudança de comportamento.

## Escopo

**Dentro**:
- Hook `useIsCompactViewport()` que detecta viewport com altura ≤ 1080px via
  `matchMedia`.
- `ContinueWatchingRow` ganha um modo colapsável ativado só quando esse hook
  retorna `true`.
- Colapsado: faixa fina (~40px) com título + chevron, no mesmo estilo visual
  da rail da `CategorySidebar`.
- Expandido: mesmo conteúdo/cards de hoje, renderizado em overlay
  (`position: absolute`) por cima do grid, sem empurrar o layout.
- Dois gatilhos de expansão: hover (peek temporário, fecha ao tirar o mouse)
  e clique (fixa aberto/fechado, independente do mouse).
- Foco via teclado (Tab) nos cards internos dispara o mesmo peek do hover,
  pra manter os cards alcançáveis sem mouse.

**Fora**:
- Nenhuma mudança de comportamento em telas com altura > 1080px — a faixa
  continua sempre expandida em fluxo normal, exatamente como hoje.
- Persistência do estado `pinned` entre sessões (localStorage) — reseta pra
  colapsado a cada carregamento do app, mesmo padrão que `CategorySidebar.isOpen`
  já usa hoje (não fica salvo em lugar nenhum).
- Colapso baseado em largura da viewport — o problema é especificamente de
  altura vertical disponível, não de largura.
- Teste de render de componente pra `ContinueWatchingRow` — ver seção Testes.

## Hook: `useIsCompactViewport`

Novo arquivo `src/hooks/useIsCompactViewport.ts`, no mesmo estilo de
`useResponsiveGrid.ts`: `useState` + `useEffect` que assina
`window.matchMedia('(max-height: 1080px)')` e atualiza no evento `change`.
Retorna um `boolean`. Sem `ResizeObserver` aqui — `matchMedia` já dispara
corretamente em resize de janela, que é o único jeito da altura da viewport
mudar neste app desktop.

```ts
export function useIsCompactViewport(maxHeightPx = 1080): boolean {
  const query = `(max-height: ${maxHeightPx}px)`;
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsCompact(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return isCompact;
}
```

## `ContinueWatchingRow`

Estado local, sem subir nada pro `MainScreen`:
- `isCompact = useIsCompactViewport()`
- `pinned` (`useState(false)`) — alternado só pelo clique no cabeçalho da
  faixa.
- `hovering` (`useState(false)`) — `onMouseEnter`/`onMouseLeave` no container
  raiz.
- `expanded = !isCompact || pinned || hovering` (em telas grandes é sempre
  `true`, preservando o comportamento atual).

Estrutura de render:
- `!isCompact`: JSX atual, inalterado, sem wrapper extra.
- `isCompact && !expanded`: faixa colapsada — `<button>` de altura ~40px com
  "Continue Watching" + `ChevronDown`, `onClick` seta `pinned = true`,
  `onMouseEnter` seta `hovering = true`.
- `isCompact && expanded`: container com `position: absolute`, `top-0`,
  `left-0`, `right-0`, `z-index` acima do grid (`z-10`), sombra
  (`shadow-lg`), contendo o cabeçalho (agora com `ChevronUp`, clique alterna
  `pinned`) e os cards de hoje. O espaço reservado no fluxo continua sendo só
  a faixa fina de 40px (ela some visualmente atrás do overlay, mas o
  `<div>` de 40px permanece no DOM ocupando o lugar, evitando salto de
  layout ao entrar/sair do overlay). O wrapper mais externo do componente
  (que engloba faixa colapsada + overlay) ganha `position: relative` pra
  servir de âncora do `absolute`.
  `onMouseLeave` do container: se `!pinned`, `hovering = false` (fecha o
  peek). Se `pinned`, mouse leave não faz nada.
  Os cards internos ganham `onFocus`/`onBlur` que também setam `hovering`,
  pra Tab conseguir abrir o peek.

Sem nenhuma dependência nova — só CSS (Tailwind já usado no resto do app) e
os hooks/estado padrão do React.

## Testes

- `useIsCompactViewport`: teste unitário mockando `window.matchMedia` (objeto
  com `matches`, `addEventListener`, `removeEventListener` e disparo manual
  do evento `change`), seguindo o padrão de `useResponsiveGrid.test.ts`.
  Cobre: valor inicial correto pra `matches: true` e `matches: false`, e
  atualização quando o listener dispara `change`.
- `ContinueWatchingRow`: **sem teste de render dedicado**, mantendo o padrão
  já estabelecido no projeto (nenhum componente React tem teste de render
  hoje — só hooks/lib/stores puros em `src/test/`, decisão registrada na spec
  de 2026-08-02 do Continue Watching original). A lógica não-trivial
  (`expanded = !isCompact || pinned || hovering`) é simples o bastante pra
  não justificar introduzir o primeiro teste de componente do projeto só por
  causa desta feature.

# Redesign visual "10-foot UI" (uso em TV grande)

## Contexto

O usuário usa uma TV Samsung de 60" como monitor principal para o Better IPTV.
A interface atual (grade de canais, página de série, configurações) foi
desenhada para tela de desktop comum: fontes pequenas, cards compactos,
pouco contraste — difícil de ler a distância. Controle é feito com
mouse/teclado normais (não há necessidade de navegação por D-pad/controle
remoto), então o problema é puramente de legibilidade/hierarquia visual, não
de input.

Referência de estilo escolhida pelo usuário: interfaces de streaming
modernas (Netflix e afins) — tema escuro, cards com imagem de capa em
destaque, tipografia grande e limpa, bastante espaço em branco.

Este é um redesign visual completo (substitui o visual padrão), não um modo
alternável. O usuário quer que o trabalho aconteça isolado da versão atual
(que já está funcionando em produção, ver `docs/superpowers/specs/` — fixes
de parser Xtream, CSP e SQL aplicados em 2026-07-29/30), com possibilidade de
abandonar sem qualquer risco à versão em uso.

Fora de escopo (decidido durante o brainstorming): embutir o player MPV
dentro da janela do app. Motivo: o mecanismo do MPV para renderizar dentro de
uma janela hospedeira (`--wid`) foi desenhado para X11 e é instável/mal
suportado em compositores Wayland nativos como o Hyprland (que é o ambiente
do usuário). O risco/esforço não compensa o ganho percebido, e o usuário
concordou em manter o MPV como processo externo.

## Arquitetura / isolamento

- Trabalho feito num **git worktree** novo: `~/Projects/better-iptv-tv-redesign`,
  branch `feature/tv-redesign`, criada a partir de `main` (que já contém os
  fixes de parser/CSP/SQL do dia 2026-07-29/30).
- `~/Projects/better-iptv` (checkout original) permanece em `main`, intocado.
- O binário em produção (`/opt/better-iptv-bin/usr/bin/better-ip-tv`,
  substituindo o pacote AUR `better-iptv-bin`) **não é tocado** até o usuário
  aprovar visualmente o resultado e decidir fazer o cutover.
- Nenhuma mudança de backend Rust é necessária — este redesign é 100%
  frontend (React/TSX/Tailwind). Os fixes de backend do dia anterior
  continuam válidos e não são reafetados.

## Direção visual — sistema de tokens

Em vez de editar classes Tailwind soltas em cada componente, criar uma
pequena camada central de tokens de design:

- **Cores**: paleta escura (dark theme), com contraste alto entre texto e
  fundo, e uma cor de destaque (accent) consistente para estados ativos/hover.
  Definida em `tailwind.config.ts` (extend do theme) + variáveis CSS em
  `index.css`.
- **Tipografia**: escala fluida via `clamp()` (cresce com o tamanho da
  janela/tela automaticamente — sem precisar de um toggle "modo TV"
  separado). Isso também beneficia o uso em desktop comum, já que a escala é
  contínua.
- **Espaçamento e densidade**: cards maiores, mais espaço entre eles, imagem
  de capa em destaque (`object-cover` preenchendo o card, em vez do
  `object-contain` pequeno atual).

## Escopo — componentes afetados

Toque visual (className/estrutura de apresentação) em:

- `ChannelCard.tsx` — cards maiores, capa em destaque, texto maior
- `MainScreen.tsx`, `CategoryBar.tsx`, `ContentTypeTabs.tsx` — grade e navegação
- `SeriesView.tsx` — página de série/temporadas/episódios
- `Settings.tsx` e abas (`GeneralTab`, `PlaybackTab`, `ParentalTab`, `AboutTab`)
- `NowPlayingBar.tsx`

**Não afetado**: hooks (`useChannelFilter`, `useEpgData`, `useChannelPlayback`
etc.), stores (`player-store.ts`), lógica de negócio, backend Rust
(`src-tauri/`), schema/dados do banco. Mesmos dados, mesma lógica — só a
camada de apresentação muda. Isso limita o raio de risco do redesign.

## Testes

- Testes de vitest existentes (`src/test/`) cobrem hooks/stores/lib, não
  className/JSX — continuam passando sem modificação, já que a lógica não
  muda.
- Validação visual é manual: `npm run dev` no worktree novo, testado ao vivo
  na TV do usuário durante o desenvolvimento.
- Sem necessidade de testes automatizados novos para este trabalho (é
  puramente visual/apresentação, sem lógica nova a proteger).

## Plano de validação e corte (cutover)

1. Desenvolver e iterar no worktree novo usando `npm run dev` (rápido, sem
   precisar compilar o Tauri a cada mudança).
2. Usuário revisa ao vivo na TV, ajustes conforme feedback.
3. Só depois de aprovação visual: build completo do Tauri
   (`cargo build --release --features tauri/custom-protocol`, mesma receita
   usada nos fixes anteriores) no worktree novo.
4. Backup do binário atual já existe (`/opt/better-iptv-bin/usr/bin/better-ip-tv.orig`).
   Reinstalar o binário novo só troca o executável — reversível a qualquer
   momento restaurando o `.orig` ou o binário compilado a partir de
   `~/Projects/better-iptv` (branch `main`, versão atual).
5. Se o usuário decidir abandonar o redesign a qualquer momento, o worktree
   pode ser removido sem qualquer efeito sobre `~/Projects/better-iptv` ou o
   binário em produção.

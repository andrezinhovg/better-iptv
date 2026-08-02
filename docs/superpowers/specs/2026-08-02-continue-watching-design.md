# Continuar assistindo / histórico de reprodução

## Contexto

O app não guarda nenhum estado de progresso de reprodução hoje. Existe uma
tabela `watch_history` no schema (`channel_id`, `watched_at`,
`duration_seconds`), mas é código morto: nenhum comando, query ou mutation em
todo o `src-tauri/src` insere ou lê dela — só a definição em `schema.rs`.

Séries não são persistidas localmente: `channels` guarda uma linha por série
(`content_type = 'series'`), mas os episódios em si vêm ao vivo da API
Xtream (`get_series_info`) toda vez que `SeriesView` abre, identificados por
`episode.id` (string), `season_number` e `episode_num`.

O MPV roda como processo externo simples (`Command::spawn`), sem socket IPC
(`--input-ipc-server`). Isso significa que o app não tem hoje nenhuma forma
de saber em que segundo do vídeo o usuário está, nem de ser avisado quando um
episódio termina dentro de uma playlist do MPV (que reproduz vários arquivos
em sequência sozinho). Adicionar IPC pra resolver isso foi avaliado e
descartado no brainstorming: aumenta bastante a superfície de bugs (socket
caindo, MPV travando) pra um ganho — retomar no segundo exato — que não foi
pedido.

## Escopo

**Dentro**:
- Canais ao vivo, filmes (VOD) e séries — os três `content_type` existentes.
- Gravar automaticamente, sem ação explícita do usuário, qual foi o último
  item aberto (e, no caso de série, qual episódio).
- Faixa "Continuar assistindo" no topo da aba "All", com os itens mais
  recentes.
- Banner na tela da série oferecendo continuar do último episódio aberto ou
  recomeçar do zero.

**Fora** (decidido no brainstorming):
- Retomar no segundo exato (precisa de IPC com o MPV — não vale a
  complexidade pro que foi pedido).
- Heurística de "concluído" por tempo de reprodução (ex: marcar episódio como
  assistido depois de N minutos de MPV aberto). O ponteiro de progresso é
  sempre "último episódio aberto", sem tentar adivinhar se foi terminado.
- Aba dedicada de histórico completo, botão de "remover da lista", nova aba
  separada de "Continuar assistindo" — nenhum desses foi pedido; a faixa no
  topo do "All" cobre o caso de uso.

## Modelo de dados

`watch_history` é substituída (via migração `DROP TABLE IF EXISTS` — segura
porque nunca teve linha escrita em nenhuma instalação) por:

```sql
CREATE TABLE watch_progress (
    channel_id INTEGER PRIMARY KEY,   -- 1 linha por canal/filme/série, upsert
    content_type TEXT NOT NULL,       -- 'live' | 'vod' | 'series'
    episode_id TEXT,                  -- só séries (id do episódio na Xtream)
    episode_extension TEXT,           -- só séries (container_extension, pra montar a URL sem depender da lista fresca da API)
    season_number INTEGER,            -- só séries
    episode_num INTEGER,              -- só séries
    episode_title TEXT,               -- só séries, para exibir "T2 E5 — Título"
    watched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX idx_watch_progress_watched_at ON watch_progress(watched_at DESC);
```

Uma linha por `channel_id` (upsert, `ON CONFLICT(channel_id) DO UPDATE`) —
não é um log histórico de todas as reproduções, só o ponteiro mais recente.
Ao apagar/trocar uma playlist, o `ON DELETE CASCADE` de `channels` já limpa o
`watch_progress` correspondente, sem código de limpeza adicional.

## Backend

Novas funções em `db/queries.rs` / `db/mutations.rs`:
- `upsert_watch_progress(conn, channel_id, content_type, episode_id, episode_extension, season_number, episode_num, episode_title)`
- `get_continue_watching(conn, playlist_id, limit) -> Vec<ContinueWatchingEntry>`
  — join com `channels` pra nome/logo/url, `ORDER BY watched_at DESC LIMIT ?`
- `get_watch_progress(conn, channel_id) -> Option<WatchProgress>`

Novos comandos Tauri, só leitura (`commands/watch_progress.rs`):
- `get_continue_watching`
- `get_watch_progress`

**Gravação é sempre feita no backend, dentro do próprio comando de play** —
não existe um comando `record_watch_progress` separado chamado pelo
frontend. Isso evita um round-trip IPC a mais e garante que o ponteiro nunca
fica dessincronizado da reprodução real (não tem como gravar progresso sem
o MPV de fato ter sido iniciado com sucesso):
- `play_channel` (live/vod): depois que `playback::play_channel` retorna
  sucesso, upsert com `content_type` do canal, sem campos de episódio.
- `play_episode_with_season` (séries): hoje recebe só
  `episodes: Vec<PlaylistEpisode>`, sem `channel_id`/temporada/episódio.
  Precisa ganhar três parâmetros novos: `channel_id: i64`,
  `season_number: i32`, `episode_num: i32` (os dois últimos referem-se ao
  primeiro episódio da fila — o que efetivamente começa a tocar). O
  `channel_id` já existe no frontend como `selectedSeries.id` dentro de
  `MainScreen.tsx`, só falta passar adiante por `SeriesView` →
  `onPlayEpisode` → `playEpisode`. Depois de tocar com sucesso, upsert com
  os dados do primeiro episódio da fila.

**Sem comando de "limpar progresso"**: "Começar do zero" apenas toca o
episódio 1 normalmente — como toda reprodução grava/atualiza o ponteiro
automaticamente, isso já sobrescreve o progresso antigo com T1E1, sem
precisar de um comando de limpeza dedicado.

**Correção de um gap encontrado no fluxo atual**: `useChannelPlayback.playEpisode`
tem hoje dois caminhos — um chama `play_episode_with_season` quando há uma
fila de episódios restantes, outro monta um "canal virtual" com `id: -1` e
chama `play_channel` diretamente quando só sobra 1 episódio. Esse segundo
caminho nunca passaria por nenhum comando que sabe gravar progresso de série
(não tem como associar `id: -1` a uma série real). A spec remove esse
fallback: `playEpisode` sempre chama `play_episode_with_season`, mesmo com
fila de 1 episódio. Resultado: um único caminho de reprodução de série, um
único ponto de gravação, menos código no frontend.

## Frontend

- `ContinueWatchingRow` (novo componente): faixa horizontal de cards acima do
  grid, renderizada só na aba "All" e só quando a lista não está vazia.
  Busca via `getContinueWatching(playlistId, 20)` ao montar `MainScreen` /
  trocar de playlist. Cada card mostra logo/poster, nome, e — pra séries —
  uma segunda linha "T{season} E{episode_num}". Clique dispara a mesma ação
  de sempre pro tipo de conteúdo (retonar canal ao vivo, tocar filme do
  início, ou abrir `SeriesView` pra série).
- `SeriesView`: ao carregar (`getSeriesInfo` já existente), busca em paralelo
  `getSeriesWatchProgress(seriesChannelId)`. Se existir progresso, mostra um
  banner acima do seletor de temporada: "Continuar T{s} E{e} — {título}", com
  dois botões:
  - **Continuar**: chama `onPlayEpisode` com o `episode_id` salvo e a fila de
    episódios restantes calculada a partir dele (mesma lógica que
    `EpisodeCard` já usa hoje: fatia a temporada a partir do índice do
    episódio e ordena por `episode_num`).
  - **Começar do zero**: chama `onPlayEpisode` com o primeiro episódio da
    primeira temporada. Como toda reprodução grava o ponteiro
    automaticamente no backend, isso já sobrescreve o progresso salvo com
    T1E1 — não precisa de uma chamada de limpeza separada.
  - Se o `episode_id` salvo não existir mais na lista atual de episódios
    (removido pelo provedor), "Continuar" ainda funciona: a URL é montada
    diretamente a partir do `episode_id`/`extension` salvos, sem depender de
    encontrá-lo na lista fresca da API.

## Testes

- Rust: testes de `upsert_watch_progress` / `get_continue_watching` /
  `get_watch_progress` em `db/queries.rs` e `db/mutations.rs`, seguindo o
  padrão já usado nos testes existentes desses módulos (helpers de
  `test_helpers.rs`).
- Frontend: **nenhum componente no repo tem teste de render hoje** (só
  hooks/store/lib puros em `src/test/`, apesar de `@testing-library/react`
  estar instalado) — descoberto ao levantar os arquivos de teste existentes
  durante o planejamento, depois da spec já aprovada. Manter esse padrão em
  vez de introduzir o primeiro teste de componente do projeto pra essa
  feature: a lógica de fila de episódios (usada tanto pelo clique normal no
  `EpisodeCard` quanto pelos botões "Continuar"/"Começar do zero") é extraída
  para uma função pura testável (`getRemainingEpisodes`), que ganha teste
  seguindo o padrão de `src/test/lib/`. `ContinueWatchingRow` e o banner de
  `SeriesView` continuam sem teste dedicado, como todo o resto dos
  componentes React do projeto.

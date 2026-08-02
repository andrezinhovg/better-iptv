# Continuar Assistindo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user resume the last-opened episode of a series (or replay a recently watched movie/channel) from a "Continue Watching" row on the main screen, with an explicit continue-or-restart choice inside the series view.

**Architecture:** A new `watch_progress` SQLite table stores one upserted row per `channel_id` (the last item/episode opened — not a full history log, not a per-second position). Recording happens entirely inside the existing `play_channel` and `play_episode_with_season` Tauri commands, right after MPV successfully starts — never via a separate frontend-triggered "record" call, so the pointer can never drift out of sync with real playback. The frontend reads it back through two new read-only commands (`get_continue_watching`, `get_watch_progress`) to render a horizontal row on the "All" tab and a resume banner inside `SeriesView`.

**Tech Stack:** Rust (rusqlite, Tauri commands) on the backend; React + Zustand + TypeScript on the frontend. No new dependencies.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-08-02-continue-watching-design.md` — every task below implements a section of it.
- No MPV IPC, no "% watched" heuristics, no per-second resume — the pointer is always "last episode/item opened," full stop (see spec's Escopo/Fora section).
- No `clear_watch_progress` / `record_watch_progress` commands — recording is upsert-on-play inside `play_channel`/`play_episode_with_season`; restarting a series just plays episode 1, which naturally overwrites the pointer.
- Frontend field names mirror the Rust struct fields exactly (snake_case), matching how `Channel`, `SeriesInfo`, `Episode` already work in `src/types/index.ts` — no camelCase translation layer.
- No new component-render tests: this repo has zero React component tests today (verified in `src/test/`) despite `@testing-library/react` being installed. Keep frontend testing at the pure-function level, matching existing convention.

---

### Task 1: `watch_progress` schema, models, and read queries

**Files:**
- Modify: `src-tauri/src/db/schema.rs:105-122` (replace the dead `watch_history` table with `watch_progress`)
- Modify: `src-tauri/src/db/models.rs` (add `WatchProgress`, `ContinueWatchingEntry`)
- Modify: `src-tauri/src/db/queries.rs:198` (add `get_watch_progress`, `get_continue_watching`, insert before `// ========== Tests ==========`)
- Modify: `src-tauri/src/db/queries.rs` tests module (add test cases)

**Interfaces:**
- Produces: `db::models::WatchProgress { channel_id: i64, content_type: String, episode_id: Option<String>, episode_extension: Option<String>, season_number: Option<i32>, episode_num: Option<i32>, episode_title: Option<String>, watched_at: String }`
- Produces: `db::models::ContinueWatchingEntry { channel_id: i64, name: String, logo: Option<String>, url: String, content_type: String, episode_id: Option<String>, episode_extension: Option<String>, season_number: Option<i32>, episode_num: Option<i32>, episode_title: Option<String>, watched_at: String }`
- Produces: `db::queries::get_watch_progress(conn: &Connection, channel_id: i64) -> Result<Option<WatchProgress>>`
- Produces: `db::queries::get_continue_watching(conn: &Connection, playlist_id: i64, limit: i64) -> Result<Vec<ContinueWatchingEntry>>`
- Consumes (test-only): `db::mutations::upsert_watch_progress` from Task 2 — this task's tests are written first and will fail to compile until Task 2 lands, so Task 1's tests are written but only run for real after Task 2. Order note: implement Task 1's schema/models/queries first (compiles standalone), then Task 2 adds the mutation, then come back and run Task 1's tests. See Step ordering below — this task's test-writing step includes the mutation calls, but the "run to verify it fails/passes" steps for the queries specifically happen after Task 2. To keep each task independently testable, Task 1 below writes its own tests using raw SQL `INSERT` (not the not-yet-existing mutation), so it is fully self-contained.

- [ ] **Step 1: Replace `watch_history` with `watch_progress` in the schema**

In `src-tauri/src/db/schema.rs`, replace lines 105-122 (the `watch_history` table + its index):

```rust
    // Watch History table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS watch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            duration_seconds INTEGER DEFAULT 0,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Index for watch history lookups by channel
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_watch_history_channel_id
         ON watch_history(channel_id)",
        [],
    )?;
```

with:

```rust
    // watch_history was schema-only dead code (never inserted or read
    // anywhere in the codebase) — safe to drop and replace.
    conn.execute("DROP TABLE IF EXISTS watch_history", [])?;

    // Watch Progress table: one upserted row per channel/movie/series,
    // tracking only the last episode/item opened (not a history log,
    // not a per-second position).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS watch_progress (
            channel_id INTEGER PRIMARY KEY,
            content_type TEXT NOT NULL,
            episode_id TEXT,
            episode_extension TEXT,
            season_number INTEGER,
            episode_num INTEGER,
            episode_title TEXT,
            watched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Index for continue-watching row ordering
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_watch_progress_watched_at
         ON watch_progress(watched_at DESC)",
        [],
    )?;
```

- [ ] **Step 2: Add the models**

Append to `src-tauri/src/db/models.rs`:

```rust
/// Last episode/item opened for a given channel (series, movie, or live
/// channel). One row per channel_id — not a history log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchProgress {
    pub channel_id: i64,
    pub content_type: String,
    pub episode_id: Option<String>,
    pub episode_extension: Option<String>,
    pub season_number: Option<i32>,
    pub episode_num: Option<i32>,
    pub episode_title: Option<String>,
    pub watched_at: String,
}

/// A watch_progress row joined with its channel's display fields, for the
/// "Continue Watching" row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinueWatchingEntry {
    pub channel_id: i64,
    pub name: String,
    pub logo: Option<String>,
    pub url: String,
    pub content_type: String,
    pub episode_id: Option<String>,
    pub episode_extension: Option<String>,
    pub season_number: Option<i32>,
    pub episode_num: Option<i32>,
    pub episode_title: Option<String>,
    pub watched_at: String,
}
```

- [ ] **Step 3: Write the failing tests**

Add to the `mod tests` block at the bottom of `src-tauri/src/db/queries.rs` (after the existing `use` lines inside that module, alongside the other `// ========== X Tests ==========` sections):

```rust
    // ========== Watch Progress Tests ==========

    fn insert_watch_progress_row(
        conn: &Connection,
        channel_id: i64,
        content_type: &str,
        episode_id: Option<&str>,
        episode_extension: Option<&str>,
        season_number: Option<i32>,
        episode_num: Option<i32>,
        episode_title: Option<&str>,
        watched_at: &str,
    ) {
        conn.execute(
            "INSERT INTO watch_progress
             (channel_id, content_type, episode_id, episode_extension, season_number, episode_num, episode_title, watched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                channel_id,
                content_type,
                episode_id,
                episode_extension,
                season_number,
                episode_num,
                episode_title,
                watched_at
            ],
        )
        .unwrap();
    }

    #[test]
    fn test_get_watch_progress_none_when_never_watched() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel_id = create_test_channel(&conn, playlist_id, "C");

        let result = get_watch_progress(&conn, channel_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_watch_progress_returns_series_pointer() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel_id = create_test_channel(&conn, playlist_id, "Series C");

        insert_watch_progress_row(
            &conn,
            channel_id,
            "series",
            Some("ep-42"),
            Some("mkv"),
            Some(2),
            Some(5),
            Some("The Return"),
            "2026-08-01 10:00:00",
        );

        let result = get_watch_progress(&conn, channel_id).unwrap().unwrap();
        assert_eq!(result.channel_id, channel_id);
        assert_eq!(result.content_type, "series");
        assert_eq!(result.episode_id.as_deref(), Some("ep-42"));
        assert_eq!(result.episode_extension.as_deref(), Some("mkv"));
        assert_eq!(result.season_number, Some(2));
        assert_eq!(result.episode_num, Some(5));
        assert_eq!(result.episode_title.as_deref(), Some("The Return"));
    }

    #[test]
    fn test_get_continue_watching_empty_when_nothing_watched() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");

        let result = get_continue_watching(&conn, playlist_id, 20).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_continue_watching_orders_most_recent_first() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let older_channel = create_test_channel(&conn, playlist_id, "Older");
        let newer_channel = create_test_channel(&conn, playlist_id, "Newer");

        insert_watch_progress_row(
            &conn, older_channel, "vod", None, None, None, None, None,
            "2020-01-01 00:00:00",
        );
        insert_watch_progress_row(
            &conn, newer_channel, "vod", None, None, None, None, None,
            "2026-08-01 00:00:00",
        );

        let result = get_continue_watching(&conn, playlist_id, 20).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].channel_id, newer_channel);
        assert_eq!(result[1].channel_id, older_channel);
    }

    #[test]
    fn test_get_continue_watching_respects_limit() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        for i in 0..3 {
            let channel_id = create_test_channel(&conn, playlist_id, &format!("C{}", i));
            insert_watch_progress_row(
                &conn, channel_id, "vod", None, None, None, None, None,
                "2026-08-01 00:00:00",
            );
        }

        let result = get_continue_watching(&conn, playlist_id, 2).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_get_continue_watching_scoped_to_playlist() {
        let conn = setup_test_db();
        let playlist_a = create_test_playlist(&conn, "A");
        let playlist_b = create_test_playlist(&conn, "B");
        let channel_a = create_test_channel(&conn, playlist_a, "In A");
        let channel_b = create_test_channel(&conn, playlist_b, "In B");

        insert_watch_progress_row(
            &conn, channel_a, "vod", None, None, None, None, None,
            "2026-08-01 00:00:00",
        );
        insert_watch_progress_row(
            &conn, channel_b, "vod", None, None, None, None, None,
            "2026-08-01 00:00:00",
        );

        let result = get_continue_watching(&conn, playlist_a, 20).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].channel_id, channel_a);
    }

    #[test]
    fn test_get_continue_watching_includes_channel_display_fields() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel = Channel {
            id: None,
            playlist_id,
            name: "My Movie".to_string(),
            url: "http://example.com/movie.mkv".to_string(),
            logo: Some("http://example.com/poster.jpg".to_string()),
            group_name: None,
            epg_id: None,
            tvg_name: None,
            content_type: "vod".to_string(),
            is_favorite: false,
            sort_order: 0,
            category_order: 0,
            created_at: None,
        };
        let channel_id = create_channel(&conn, &channel).unwrap();

        insert_watch_progress_row(
            &conn, channel_id, "vod", None, None, None, None, None,
            "2026-08-01 00:00:00",
        );

        let result = get_continue_watching(&conn, playlist_id, 20).unwrap();
        assert_eq!(result[0].name, "My Movie");
        assert_eq!(result[0].url, "http://example.com/movie.mkv");
        assert_eq!(result[0].logo.as_deref(), Some("http://example.com/poster.jpg"));
        assert_eq!(result[0].content_type, "vod");
    }
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test get_watch_progress get_continue_watching`
Expected: FAIL to compile — `get_watch_progress` and `get_continue_watching` are not defined yet.

- [ ] **Step 5: Implement the queries**

Insert into `src-tauri/src/db/queries.rs` at line 198 (right after the closing `}` of `get_channel_groups`, before `// ========== Tests ==========`):

```rust
// ========== Watch Progress Queries ==========

const WATCH_PROGRESS_SELECT_COLUMNS: &str =
    "channel_id, content_type, episode_id, episode_extension, season_number, episode_num, episode_title, watched_at";

fn map_watch_progress_row(row: &Row) -> rusqlite::Result<WatchProgress> {
    Ok(WatchProgress {
        channel_id: row.get(0)?,
        content_type: row.get(1)?,
        episode_id: row.get(2)?,
        episode_extension: row.get(3)?,
        season_number: row.get(4)?,
        episode_num: row.get(5)?,
        episode_title: row.get(6)?,
        watched_at: row.get(7)?,
    })
}

/// Get the last episode/item opened for a channel, if any.
pub fn get_watch_progress(conn: &Connection, channel_id: i64) -> Result<Option<WatchProgress>> {
    let sql = format!(
        "SELECT {} FROM watch_progress WHERE channel_id = ?1",
        WATCH_PROGRESS_SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params![channel_id], map_watch_progress_row)?;
    rows.next().transpose()
}

/// Get the most recently opened items for a playlist, for the
/// "Continue Watching" row. Ordered most-recent-first.
pub fn get_continue_watching(
    conn: &Connection,
    playlist_id: i64,
    limit: i64,
) -> Result<Vec<ContinueWatchingEntry>> {
    let sql = "SELECT wp.channel_id, c.name, c.logo, c.url, wp.content_type,
                      wp.episode_id, wp.episode_extension, wp.season_number,
                      wp.episode_num, wp.episode_title, wp.watched_at
               FROM watch_progress wp
               JOIN channels c ON c.id = wp.channel_id
               WHERE c.playlist_id = ?1
               ORDER BY wp.watched_at DESC
               LIMIT ?2";
    let mut stmt = conn.prepare(sql)?;
    let entries = stmt
        .query_map(params![playlist_id, limit], |row| {
            Ok(ContinueWatchingEntry {
                channel_id: row.get(0)?,
                name: row.get(1)?,
                logo: row.get(2)?,
                url: row.get(3)?,
                content_type: row.get(4)?,
                episode_id: row.get(5)?,
                episode_extension: row.get(6)?,
                season_number: row.get(7)?,
                episode_num: row.get(8)?,
                episode_title: row.get(9)?,
                watched_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(entries)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test get_watch_progress get_continue_watching`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/schema.rs src-tauri/src/db/models.rs src-tauri/src/db/queries.rs
git commit -m "feat(backend): add watch_progress table and read queries"
```

---

### Task 2: `upsert_watch_progress` mutation

**Files:**
- Modify: `src-tauri/src/db/mutations.rs` (add function after `toggle_favorite`, around line 98)
- Modify: `src-tauri/src/db/mutations.rs` tests module

**Interfaces:**
- Consumes: `db::queries::get_watch_progress` (Task 1) for test assertions
- Produces: `db::mutations::upsert_watch_progress(conn: &Connection, channel_id: i64, content_type: &str, episode_id: Option<&str>, episode_extension: Option<&str>, season_number: Option<i32>, episode_num: Option<i32>, episode_title: Option<&str>) -> Result<()>`

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `src-tauri/src/db/mutations.rs` (it already imports `crate::db::queries::*`, so `get_watch_progress` is in scope):

```rust
    // ========== Watch Progress Tests ==========

    #[test]
    fn test_upsert_watch_progress_inserts_series_pointer() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel_id = create_test_channel(&conn, playlist_id, "Series C");

        upsert_watch_progress(
            &conn,
            channel_id,
            "series",
            Some("ep-1"),
            Some("mp4"),
            Some(1),
            Some(3),
            Some("Pilot"),
        )
        .unwrap();

        let result = get_watch_progress(&conn, channel_id).unwrap().unwrap();
        assert_eq!(result.content_type, "series");
        assert_eq!(result.episode_id.as_deref(), Some("ep-1"));
        assert_eq!(result.episode_extension.as_deref(), Some("mp4"));
        assert_eq!(result.season_number, Some(1));
        assert_eq!(result.episode_num, Some(3));
        assert_eq!(result.episode_title.as_deref(), Some("Pilot"));
    }

    #[test]
    fn test_upsert_watch_progress_live_channel_has_no_episode_fields() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel_id = create_test_channel(&conn, playlist_id, "Live C");

        upsert_watch_progress(&conn, channel_id, "live", None, None, None, None, None).unwrap();

        let result = get_watch_progress(&conn, channel_id).unwrap().unwrap();
        assert_eq!(result.content_type, "live");
        assert!(result.episode_id.is_none());
        assert!(result.season_number.is_none());
    }

    #[test]
    fn test_upsert_watch_progress_updates_existing_row_in_place() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "P");
        let channel_id = create_test_channel(&conn, playlist_id, "Series C");

        upsert_watch_progress(
            &conn, channel_id, "series", Some("ep-1"), Some("mp4"), Some(1), Some(1), Some("Pilot"),
        )
        .unwrap();
        upsert_watch_progress(
            &conn, channel_id, "series", Some("ep-2"), Some("mp4"), Some(1), Some(2), Some("Second"),
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM watch_progress WHERE channel_id = ?1",
                params![channel_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "upsert must update in place, not insert a second row");

        let result = get_watch_progress(&conn, channel_id).unwrap().unwrap();
        assert_eq!(result.episode_id.as_deref(), Some("ep-2"));
        assert_eq!(result.episode_num, Some(2));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test upsert_watch_progress`
Expected: FAIL to compile — `upsert_watch_progress` is not defined yet.

- [ ] **Step 3: Implement the mutation**

Insert into `src-tauri/src/db/mutations.rs` right after `toggle_favorite` (after the closing `}` around line 98, before `// ========== Settings Mutations ==========`):

```rust
// ========== Watch Progress Mutations ==========

/// Record the last episode/item opened for a channel. Upserts a single row
/// per channel_id — this is a pointer, not a history log.
pub fn upsert_watch_progress(
    conn: &Connection,
    channel_id: i64,
    content_type: &str,
    episode_id: Option<&str>,
    episode_extension: Option<&str>,
    season_number: Option<i32>,
    episode_num: Option<i32>,
    episode_title: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO watch_progress
         (channel_id, content_type, episode_id, episode_extension, season_number, episode_num, episode_title, watched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
         ON CONFLICT(channel_id) DO UPDATE SET
            content_type = excluded.content_type,
            episode_id = excluded.episode_id,
            episode_extension = excluded.episode_extension,
            season_number = excluded.season_number,
            episode_num = excluded.episode_num,
            episode_title = excluded.episode_title,
            watched_at = CURRENT_TIMESTAMP",
        params![
            channel_id,
            content_type,
            episode_id,
            episode_extension,
            season_number,
            episode_num,
            episode_title
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test upsert_watch_progress`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/mutations.rs
git commit -m "feat(backend): add upsert_watch_progress mutation"
```

---

### Task 3: Read-only Tauri commands

**Files:**
- Create: `src-tauri/src/commands/watch_progress.rs`
- Modify: `src-tauri/src/commands/mod.rs` (register the new module)
- Modify: `src-tauri/src/lib.rs:130-170` (register the two commands in `generate_handler!`)

**Interfaces:**
- Consumes: `db::queries::get_watch_progress`, `db::queries::get_continue_watching` (Task 1); `channel_domain::validate_channel_id`, `channel_domain::validate_playlist_id` (existing, in `src-tauri/src/channel_domain/mod.rs`)
- Produces: Tauri command `get_watch_progress(state, channel_id: i64) -> Result<Option<WatchProgress>, AppError>`
- Produces: Tauri command `get_continue_watching(state, playlist_id: i64, limit: i64) -> Result<Vec<ContinueWatchingEntry>, AppError>`

This task has no meaningful unit-testable logic of its own beyond what Task 1 already covers (it's a thin Tauri wrapper) — verification is the build + a manual smoke check via `cargo check`, matching how `commands/channel.rs` (also a thin wrapper) has no dedicated command-level tests in this codebase.

- [ ] **Step 1: Create the command module**

Create `src-tauri/src/commands/watch_progress.rs`:

```rust
use crate::channel_domain;
use crate::db::models::{ContinueWatchingEntry, WatchProgress};
use crate::db::queries;
use crate::error::AppError;
use crate::state::AppState;
use log::debug;
use tauri::State;

#[tauri::command]
pub async fn get_watch_progress(
    state: State<'_, AppState>,
    channel_id: i64,
) -> Result<Option<WatchProgress>, AppError> {
    channel_domain::validate_channel_id(channel_id)?;

    let conn = state.pool.get()?;
    let progress = queries::get_watch_progress(&conn, channel_id)?;
    debug!("get_watch_progress channel_id={} -> found={}", channel_id, progress.is_some());
    Ok(progress)
}

#[tauri::command]
pub async fn get_continue_watching(
    state: State<'_, AppState>,
    playlist_id: i64,
    limit: i64,
) -> Result<Vec<ContinueWatchingEntry>, AppError> {
    channel_domain::validate_playlist_id(playlist_id)?;

    let conn = state.pool.get()?;
    let entries = queries::get_continue_watching(&conn, playlist_id, limit)?;
    debug!("get_continue_watching playlist_id={} -> {} entries", playlist_id, entries.len());
    Ok(entries)
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/commands/mod.rs`, add `pub mod watch_progress;` and `pub use watch_progress::*;`:

```rust
// Command modules organized by domain
pub mod playback;
pub mod playlist;
pub mod channel;
pub mod epg;
pub mod series;
pub mod settings;
pub mod parental;
pub mod watch_progress;

// Re-export all commands for lib.rs
pub use playback::*;
pub use playlist::*;
pub use channel::*;
pub use epg::*;
pub use series::*;
pub use settings::*;
pub use parental::*;
pub use watch_progress::*;
```

- [ ] **Step 3: Register the commands in the Tauri handler**

In `src-tauri/src/lib.rs`, inside the `tauri::generate_handler![` list, add a new section after `// Series commands`:

```rust
            // Series commands
            get_series_info,
            play_episode_with_season,
            // Watch progress commands
            get_watch_progress,
            get_continue_watching,
```

- [ ] **Step 4: Verify it builds**

Run: `cd src-tauri && cargo check`
Expected: builds cleanly, no warnings about unused commands.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/watch_progress.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(backend): expose get_watch_progress and get_continue_watching commands"
```

---

### Task 4: Record progress on live/VOD playback

**Files:**
- Modify: `src-tauri/src/commands/playback.rs`

**Interfaces:**
- Consumes: `db::mutations::upsert_watch_progress` (Task 2)
- Modifies existing command: `play_channel(state, channel: Channel) -> Result<(), AppError>` (signature unchanged, behavior extended)

No new automated test: `play_channel` already has no unit tests in this codebase (it drives a real MPV process, per `playback/mpv.rs`'s existing test style which only checks installation/URL-validation logic, not actual playback side effects). Verified instead by `cargo check` plus the existing full test suite staying green (Step 3), consistent with how this command was already covered before this change.

- [ ] **Step 1: Add the mutations import**

In `src-tauri/src/commands/playback.rs`, change:

```rust
use crate::db::{queries, models::Channel};
```

to:

```rust
use crate::db::{queries, mutations, models::Channel};
```

- [ ] **Step 2: Record progress after a successful play**

In `src-tauri/src/commands/playback.rs`, replace the `play_channel` command body:

```rust
#[tauri::command]
pub async fn play_channel(state: State<'_, AppState>, channel: Channel) -> Result<(), AppError> {
    let (audio_lang, subtitle_lang) = {
        let conn = state.pool.get()?;
        let settings = queries::get_multiple_settings(&conn, &["audio_language", "subtitle_language"])?;

        let audio = settings
            .get("audio_language")
            .filter(|s| !s.is_empty())
            .cloned();
        let subtitle = settings
            .get("subtitle_language")
            .filter(|s| !s.is_empty())
            .cloned();

        (audio, subtitle)
    };

    let mut player = state.mpv_player.lock().await;
    playback::play_channel(
        &mut player,
        &state.current_channel,
        &channel,
        audio_lang.as_deref(),
        subtitle_lang.as_deref(),
    )
    .await?;

    info!("Playing channel: {} ({})", channel.name, channel.content_type);

    Ok(())
}
```

with:

```rust
#[tauri::command]
pub async fn play_channel(state: State<'_, AppState>, channel: Channel) -> Result<(), AppError> {
    let (audio_lang, subtitle_lang) = {
        let conn = state.pool.get()?;
        let settings = queries::get_multiple_settings(&conn, &["audio_language", "subtitle_language"])?;

        let audio = settings
            .get("audio_language")
            .filter(|s| !s.is_empty())
            .cloned();
        let subtitle = settings
            .get("subtitle_language")
            .filter(|s| !s.is_empty())
            .cloned();

        (audio, subtitle)
    };

    {
        let mut player = state.mpv_player.lock().await;
        playback::play_channel(
            &mut player,
            &state.current_channel,
            &channel,
            audio_lang.as_deref(),
            subtitle_lang.as_deref(),
        )
        .await?;
    }

    if let Some(channel_id) = channel.id {
        let conn = state.pool.get()?;
        mutations::upsert_watch_progress(&conn, channel_id, &channel.content_type, None, None, None, None, None)?;
    }

    info!("Playing channel: {} ({})", channel.name, channel.content_type);

    Ok(())
}
```

(The `player` lock is now scoped to a block so it's released before the DB call — the DB pool has its own lock, no need to hold both at once.)

- [ ] **Step 3: Run the full backend test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS, same test count as before plus Task 1/2's new tests — no regressions.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/playback.rs
git commit -m "feat(backend): record watch progress on live/VOD playback"
```

---

### Task 5: Record progress on series playback + carry `channel_id`/season/episode through

**Files:**
- Modify: `src-tauri/src/commands/series.rs`

**Interfaces:**
- Consumes: `db::mutations::upsert_watch_progress` (Task 2); `channel_domain::validate_channel_id` (existing)
- Modifies existing command signature: `play_episode_with_season(state, server_url: String, username: String, password: String, episodes: Vec<PlaylistEpisode>) -> Result<(), AppError>` becomes `play_episode_with_season(state, server_url: String, username: String, password: String, channel_id: i64, season_number: i32, episode_num: i32, episodes: Vec<PlaylistEpisode>) -> Result<(), AppError>` — **breaking change**, the frontend call site is updated in Task 9.

No new automated test, for the same reason as Task 4 (this command drives real MPV playback; existing coverage for series playback logic lives in `series_domain`'s pure-function tests, which are untouched by this change). Verified via `cargo check` and the full suite staying green.

- [ ] **Step 1: Add imports**

In `src-tauri/src/commands/series.rs`, change:

```rust
use crate::error::AppError;
use crate::playlist::{fetch_series_info, SeriesInfo, XtreamCredentials};
use crate::series_domain::{self, PlaylistEpisode};
use crate::state::AppState;
use log::info;
use tauri::State;
```

to:

```rust
use crate::channel_domain;
use crate::db::mutations;
use crate::error::AppError;
use crate::playlist::{fetch_series_info, SeriesInfo, XtreamCredentials};
use crate::series_domain::{self, PlaylistEpisode};
use crate::state::AppState;
use log::info;
use tauri::State;
```

- [ ] **Step 2: Extend the command signature and record progress**

Replace the `play_episode_with_season` command:

```rust
#[tauri::command]
pub async fn play_episode_with_season(
    state: State<'_, AppState>,
    server_url: String,
    username: String,
    password: String,
    episodes: Vec<PlaylistEpisode>,
) -> Result<(), AppError> {
    series_domain::validate_episodes(&episodes)?;
    series_domain::validate_server_url(&server_url)?;
    series_domain::validate_credentials(&username, &password)?;

    let urls = series_domain::build_episode_urls(&server_url, &username, &password, &episodes);

    let first_title = &episodes[0].title;

    {
        let mut current = state.current_channel.write().await;
        *current = Some(crate::state::CurrentChannel {
            id: None,
            name: first_title.clone(),
            url: urls[0].clone(),
            content_type: "series".to_string(),
        });
    }

    let (audio_lang, subtitle_lang) = {
        let conn = state.pool.get()?;
        get_language_settings(&conn)?
    };

    let mut player = state.mpv_player.lock().await;
    player
        .play_with_playlist(
            &urls,
            Some(first_title),
            audio_lang.as_deref(),
            subtitle_lang.as_deref(),
        )
        .map_err(|e| AppError::Mpv(e.to_string()))?;

    info!("Playing series episode: {}", first_title);

    Ok(())
}
```

with:

```rust
#[tauri::command]
pub async fn play_episode_with_season(
    state: State<'_, AppState>,
    server_url: String,
    username: String,
    password: String,
    channel_id: i64,
    season_number: i32,
    episode_num: i32,
    episodes: Vec<PlaylistEpisode>,
) -> Result<(), AppError> {
    series_domain::validate_episodes(&episodes)?;
    series_domain::validate_server_url(&server_url)?;
    series_domain::validate_credentials(&username, &password)?;
    channel_domain::validate_channel_id(channel_id)?;

    let urls = series_domain::build_episode_urls(&server_url, &username, &password, &episodes);

    let first_episode = &episodes[0];
    let first_title = &first_episode.title;

    {
        let mut current = state.current_channel.write().await;
        *current = Some(crate::state::CurrentChannel {
            id: Some(channel_id),
            name: first_title.clone(),
            url: urls[0].clone(),
            content_type: "series".to_string(),
        });
    }

    let (audio_lang, subtitle_lang) = {
        let conn = state.pool.get()?;
        get_language_settings(&conn)?
    };

    {
        let mut player = state.mpv_player.lock().await;
        player
            .play_with_playlist(
                &urls,
                Some(first_title),
                audio_lang.as_deref(),
                subtitle_lang.as_deref(),
            )
            .map_err(|e| AppError::Mpv(e.to_string()))?;
    }

    {
        let conn = state.pool.get()?;
        mutations::upsert_watch_progress(
            &conn,
            channel_id,
            "series",
            Some(&first_episode.id),
            Some(&first_episode.extension),
            Some(season_number),
            Some(episode_num),
            Some(first_title),
        )?;
    }

    info!("Playing series episode: {}", first_title);

    Ok(())
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd src-tauri && cargo check`
Expected: builds cleanly. This will show a downstream error in nothing else yet since the frontend call site (TypeScript) isn't type-checked by cargo — that's fixed in Task 9.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/series.rs
git commit -m "feat(backend): record watch progress on series playback, thread channel_id through"
```

---

### Task 6: Frontend types and Tauri wrappers

**Files:**
- Modify: `src/types/index.ts` (add `WatchProgress`, `ContinueWatchingEntry`)
- Modify: `src/lib/tauri.ts` (add `getWatchProgress`, `getContinueWatching`; update `playEpisodeWithSeason`)

**Interfaces:**
- Produces: `WatchProgress` type — `{ channel_id: number; content_type: 'live' | 'vod' | 'series'; episode_id?: string; episode_extension?: string; season_number?: number; episode_num?: number; episode_title?: string; watched_at: string }`
- Produces: `ContinueWatchingEntry` type — same fields as `WatchProgress` plus `name: string; logo?: string; url: string`
- Produces: `getWatchProgress(channelId: number): Promise<WatchProgress | null>`
- Produces: `getContinueWatching(playlistId: number, limit: number): Promise<ContinueWatchingEntry[]>`
- Modifies: `playEpisodeWithSeason(serverUrl: string, username: string, password: string, channelId: number, seasonNumber: number, episodeNum: number, episodes: PlaylistEpisode[]): Promise<void>` (was: `(serverUrl, username, password, episodes)`) — **breaking change**, call site fixed in Task 9.

This task is pure type/wrapper plumbing (mirrors how every other command in `tauri.ts` has no dedicated test) — verified by the TypeScript compiler in Step 3.

- [ ] **Step 1: Add the types**

Append to `src/types/index.ts`:

```ts
export interface WatchProgress {
  channel_id: number;
  content_type: 'live' | 'vod' | 'series';
  episode_id?: string;
  episode_extension?: string;
  season_number?: number;
  episode_num?: number;
  episode_title?: string;
  watched_at: string;
}

export interface ContinueWatchingEntry {
  channel_id: number;
  name: string;
  logo?: string;
  url: string;
  content_type: 'live' | 'vod' | 'series';
  episode_id?: string;
  episode_extension?: string;
  season_number?: number;
  episode_num?: number;
  episode_title?: string;
  watched_at: string;
}
```

- [ ] **Step 2: Add/update the Tauri wrappers**

In `src/lib/tauri.ts`, update the import line:

```ts
import type { Channel, Playlist, SeriesInfo, MergeResult } from '../types';
```

to:

```ts
import type { Channel, Playlist, SeriesInfo, MergeResult, WatchProgress, ContinueWatchingEntry } from '../types';
```

Replace the `playEpisodeWithSeason` function:

```ts
export async function playEpisodeWithSeason(
  serverUrl: string,
  username: string,
  password: string,
  episodes: PlaylistEpisode[]
): Promise<void> {
  return await invoke('play_episode_with_season', {
    serverUrl,
    username,
    password,
    episodes,
  });
}
```

with:

```ts
export async function playEpisodeWithSeason(
  serverUrl: string,
  username: string,
  password: string,
  channelId: number,
  seasonNumber: number,
  episodeNum: number,
  episodes: PlaylistEpisode[]
): Promise<void> {
  return await invoke('play_episode_with_season', {
    serverUrl,
    username,
    password,
    channelId,
    seasonNumber,
    episodeNum,
    episodes,
  });
}
```

Add after it (still under `// ========== Series Commands ==========`):

```ts
// ========== Watch Progress Commands ==========

export async function getWatchProgress(channelId: number): Promise<WatchProgress | null> {
  return await invoke('get_watch_progress', { channelId });
}

export async function getContinueWatching(
  playlistId: number,
  limit: number
): Promise<ContinueWatchingEntry[]> {
  return await invoke('get_continue_watching', { playlistId, limit });
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: New errors at every call site of `playEpisodeWithSeason` (still using the old 4-arg signature) — that's expected, they're fixed in Task 9. No other new errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts
git commit -m "feat(frontend): add watch progress types and Tauri command wrappers"
```

---

### Task 7: `getRemainingEpisodes` helper

**Files:**
- Create: `src/lib/episodeQueue.ts`
- Create: `src/test/lib/episodeQueue.test.ts`

**Interfaces:**
- Consumes: `Episode` type from `../types` (existing: `{ id: string; episode_num: number; title: string; container_extension: string; season: number; info: EpisodeInfo }`); `PlaylistEpisode` type from `./tauri` (existing: `{ id: string; title: string; extension: string }`)
- Produces: `getRemainingEpisodes(seasonEpisodes: Episode[], fromEpisodeId: string): PlaylistEpisode[]`

This extracts the slice-from-clicked-episode-and-sort logic that today lives inline in `SeriesView.tsx`'s `EpisodeCard` `onPlay` handler, so it can be reused by the "Continue"/"Start Over" banner buttons added in Task 12 without duplicating it.

- [ ] **Step 1: Write the failing test**

Create `src/test/lib/episodeQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getRemainingEpisodes } from '../../lib/episodeQueue';
import type { Episode } from '../../types';

const makeEpisode = (overrides: Partial<Episode>): Episode => ({
  id: '1',
  episode_num: 1,
  title: 'Episode',
  container_extension: 'mp4',
  season: 1,
  info: {},
  ...overrides,
});

describe('getRemainingEpisodes', () => {
  it('returns episodes from the given id onward, sorted by episode_num', () => {
    const episodes = [
      makeEpisode({ id: 'e1', episode_num: 1 }),
      makeEpisode({ id: 'e2', episode_num: 2 }),
      makeEpisode({ id: 'e3', episode_num: 3 }),
    ];

    const result = getRemainingEpisodes(episodes, 'e2');

    expect(result.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('maps to the PlaylistEpisode shape (id, title, extension)', () => {
    const episodes = [
      makeEpisode({ id: 'e1', title: 'Pilot', container_extension: 'mkv' }),
    ];

    const result = getRemainingEpisodes(episodes, 'e1');

    expect(result).toEqual([{ id: 'e1', title: 'Pilot', extension: 'mkv' }]);
  });

  it('returns an empty list when the episode id is not found', () => {
    const episodes = [makeEpisode({ id: 'e1' })];

    const result = getRemainingEpisodes(episodes, 'missing');

    expect(result).toEqual([]);
  });

  it('sorts out-of-order input by episode_num', () => {
    const episodes = [
      makeEpisode({ id: 'e3', episode_num: 3 }),
      makeEpisode({ id: 'e1', episode_num: 1 }),
      makeEpisode({ id: 'e2', episode_num: 2 }),
    ];

    const result = getRemainingEpisodes(episodes, 'e1');

    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/lib/episodeQueue.test.ts`
Expected: FAIL — `../../lib/episodeQueue` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/episodeQueue.ts`:

```ts
import type { Episode } from '../types';
import type { PlaylistEpisode } from './tauri';

/**
 * Builds the episode playback queue starting at `fromEpisodeId`: slices the
 * season's episode list from that episode onward, sorted by episode_num.
 * Returns an empty list if the episode isn't found in `seasonEpisodes`.
 */
export function getRemainingEpisodes(
  seasonEpisodes: Episode[],
  fromEpisodeId: string
): PlaylistEpisode[] {
  const fromIndex = seasonEpisodes.findIndex((ep) => ep.id === fromEpisodeId);
  if (fromIndex === -1) return [];

  return seasonEpisodes
    .slice(fromIndex)
    .sort((a, b) => a.episode_num - b.episode_num)
    .map((ep) => ({ id: ep.id, title: ep.title, extension: ep.container_extension }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/lib/episodeQueue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/episodeQueue.ts src/test/lib/episodeQueue.test.ts
git commit -m "feat(frontend): extract getRemainingEpisodes episode-queue helper"
```

---

### Task 8: `continueWatching` store state

**Files:**
- Modify: `src/stores/player-store.ts`

**Interfaces:**
- Consumes: `getContinueWatching` (Task 6, from `../lib/tauri`)
- Produces store fields: `continueWatching: ContinueWatchingEntry[]`, `setContinueWatching: (entries: ContinueWatchingEntry[]) => void`, `loadContinueWatching: (playlistId: number) => Promise<void>`

No dedicated test: this mirrors `loadParentalSettings`, the existing async IPC-backed store action in this same file, which also has no test coverage (confirmed in `src/test/stores/player-store.test.ts` — that file only exercises synchronous state transitions, never the `invoke`-calling actions). Consistent with established convention.

- [ ] **Step 1: Update the import**

In `src/stores/player-store.ts`, change:

```ts
import type { Channel, Playlist, SeriesInfo } from '../types';
import { getParentalSettings, getBlockedChannels, toggleFavorite } from '../lib/tauri';
```

to:

```ts
import type { Channel, Playlist, SeriesInfo, ContinueWatchingEntry } from '../types';
import { getParentalSettings, getBlockedChannels, toggleFavorite, getContinueWatching } from '../lib/tauri';
```

- [ ] **Step 2: Add the interface fields**

In the `PlayerState` interface, add after the `checkChannelBlocked` line:

```ts
  checkChannelBlocked: (channel: Channel) => boolean;

  // Continue Watching
  continueWatching: ContinueWatchingEntry[];
  setContinueWatching: (entries: ContinueWatchingEntry[]) => void;
  loadContinueWatching: (playlistId: number) => Promise<void>;
}
```

- [ ] **Step 3: Add the implementation**

In the store body (the `create<PlayerState>((set) => ({ ... }))` object), add after the `checkChannelBlocked` implementation (right before the final `}));`):

```ts
  checkChannelBlocked: (channel) => {
    const state = usePlayerStore.getState();
    if (!state.parentalEnabled || state.parentalUnlocked) return false;
    if (channel.id && state.blockedChannelIds.has(channel.id)) return true;
    if (channel.group_name && state.blockedCategories.includes(channel.group_name)) return true;
    return false;
  },

  // Continue Watching
  continueWatching: [],
  setContinueWatching: (entries) => set({ continueWatching: entries }),
  loadContinueWatching: async (playlistId) => {
    try {
      const entries = await getContinueWatching(playlistId, 20);
      set({ continueWatching: entries });
    } catch (error) {
      console.error('Failed to load continue watching:', error);
    }
  },
}));
```

(This replaces the existing final `checkChannelBlocked: (channel) => {...},\n}));` block — same body, just followed by the new fields instead of closing immediately.)

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 5: Commit**

```bash
git add src/stores/player-store.ts
git commit -m "feat(frontend): add continueWatching state to player store"
```

---

### Task 9: `useChannelPlayback` — consolidate episode playback, drop the id:-1 fallback, refresh continue-watching

**Files:**
- Modify: `src/hooks/useChannelPlayback.ts`

**Interfaces:**
- Consumes: `usePlayerStore` field `loadContinueWatching` (Task 8); `playEpisodeWithSeason` new signature (Task 6)
- Modifies: `playEpisode(episodeId, extension, title, playlist, remainingEpisodes?)` becomes `playEpisode(channelId: number, episodeId: string, extension: string, title: string, seasonNumber: number, episodeNum: number, playlist: Playlist, remainingEpisodes?: PlaylistEpisode[]): Promise<void>` — **breaking change**, call site fixed in Task 10.
- `play(channel: Channel)` keeps its existing signature.

This hook has no existing test file in the codebase (confirmed: only `useChannelFilter`, `useDebouncedValue`, `useErrorHandler`, `useGridKeyboardNav` have tests under `src/test/hooks/`) — it drives real IPC/playback side effects, same category as `play_channel` in Task 4. No test added, matching convention; verified via `npx tsc --noEmit` plus manual smoke test in Task 12's final wiring.

- [ ] **Step 1: Add the store import for `loadContinueWatching`**

In `src/hooks/useChannelPlayback.ts`, the hook already calls `usePlayerStore((s) => s.xxx)` selectors at the top — add one more selector inside `useChannelPlayback()`, right after the existing `setNextProgram` selector line:

```ts
  const setNextProgram = usePlayerStore((s) => s.setNextProgram);
  const loadContinueWatching = usePlayerStore((s) => s.loadContinueWatching);
```

- [ ] **Step 2: Refresh continue-watching after a successful live/VOD play**

In the `play` callback, right after `setIsPlaying(true);` (the one directly following `await tauriPlayChannel(channel); setCurrentChannel(channel);`), add the refresh call (fire-and-forget — `loadContinueWatching` already catches its own errors internally):

```ts
        // Play new channel
        await tauriPlayChannel(channel);
        setCurrentChannel(channel);
        setIsPlaying(true);
        loadContinueWatching(channel.playlist_id);
```

Add `loadContinueWatching` to that callback's dependency array — change:

```ts
    [currentChannel, isPlaying, setCurrentChannel, setIsPlaying, setCurrentProgram, setNextProgram]
```

to:

```ts
    [currentChannel, isPlaying, setCurrentChannel, setIsPlaying, setCurrentProgram, setNextProgram, loadContinueWatching]
```

- [ ] **Step 3: Replace `playEpisode` — one path, no `id: -1` fallback**

Replace the entire `playEpisode` callback:

```ts
  // Play episode(s) from a series
  const playEpisode = useCallback(
    async (
      episodeId: string,
      extension: string,
      title: string,
      playlist: Playlist,
      remainingEpisodes?: PlaylistEpisode[]
    ) => {
      if (!playlist.url || !playlist.xtream_username || !playlist.xtream_password) {
        logger.error('Missing Xtream credentials');
        throw new Error('Missing Xtream credentials');
      }

      try {
        if (remainingEpisodes && remainingEpisodes.length > 0) {
          // Play season playlist
          await playEpisodeWithSeason(
            playlist.url,
            playlist.xtream_username,
            playlist.xtream_password,
            remainingEpisodes
          );
          setIsPlaying(true);
        } else {
          // Fallback: play single episode
          const episodeUrl = `${playlist.url.replace(/\/$/, '')}/series/${playlist.xtream_username}/${playlist.xtream_password}/${episodeId}.${extension}`;

          const episodeChannel: Channel = {
            id: -1, // Virtual channel
            playlist_id: playlist.id || 0,
            name: title,
            url: episodeUrl,
            content_type: 'series',
            is_favorite: false,
            sort_order: 0,
          };

          await tauriPlayChannel(episodeChannel);
          setCurrentChannel(episodeChannel);
          setIsPlaying(true);
        }
      } catch (err) {
        logger.error('Failed to play episode:', err);
        throw err;
      }
    },
    [setCurrentChannel, setIsPlaying]
  );
```

with:

```ts
  // Play episode(s) from a series. Always goes through the season-playlist
  // command (even for a queue of 1) — one recording path, one code path.
  const playEpisode = useCallback(
    async (
      channelId: number,
      episodeId: string,
      extension: string,
      title: string,
      seasonNumber: number,
      episodeNum: number,
      playlist: Playlist,
      remainingEpisodes?: PlaylistEpisode[]
    ) => {
      if (!playlist.url || !playlist.xtream_username || !playlist.xtream_password) {
        logger.error('Missing Xtream credentials');
        throw new Error('Missing Xtream credentials');
      }

      try {
        const queue =
          remainingEpisodes && remainingEpisodes.length > 0
            ? remainingEpisodes
            : [{ id: episodeId, title, extension }];

        await playEpisodeWithSeason(
          playlist.url,
          playlist.xtream_username,
          playlist.xtream_password,
          channelId,
          seasonNumber,
          episodeNum,
          queue
        );

        const episodeChannel: Channel = {
          id: channelId,
          playlist_id: playlist.id || 0,
          name: title,
          url: `${playlist.url.replace(/\/$/, '')}/series/${playlist.xtream_username}/${playlist.xtream_password}/${episodeId}.${extension}`,
          content_type: 'series',
          is_favorite: false,
          sort_order: 0,
        };
        setCurrentChannel(episodeChannel);
        setIsPlaying(true);
        if (playlist.id) loadContinueWatching(playlist.id);
      } catch (err) {
        logger.error('Failed to play episode:', err);
        throw err;
      }
    },
    [setCurrentChannel, setIsPlaying, loadContinueWatching]
  );
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: errors at `playEpisode`'s and `play`'s call sites in `MainScreen.tsx` (old signatures) — expected, fixed in Task 10. No other new errors in this file.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useChannelPlayback.ts
git commit -m "feat(frontend): consolidate episode playback into one path, refresh continue-watching after play"
```

---

### Task 10: `ContinueWatchingRow` component

**Files:**
- Create: `src/components/ContinueWatchingRow.tsx`

**Interfaces:**
- Consumes: `ContinueWatchingEntry` type (Task 6)
- Produces: `ContinueWatchingRow({ entries: ContinueWatchingEntry[]; onSelect: (channelId: number) => void }): JSX.Element | null`

No test (matches the "no component-render tests in this repo" convention noted in the Global Constraints and Task 9).

- [ ] **Step 1: Create the component**

Create `src/components/ContinueWatchingRow.tsx`:

```tsx
import { memo } from 'react';
import type { ContinueWatchingEntry } from '../types';

interface ContinueWatchingRowProps {
  /** Most-recently-watched items, most recent first */
  entries: ContinueWatchingEntry[];
  /** Callback with the channel_id of the selected entry */
  onSelect: (channelId: number) => void;
}

/**
 * Horizontal "Continue Watching" strip shown above the channel grid on the
 * "All" tab. Renders nothing when there's no watch history yet.
 */
export const ContinueWatchingRow = memo(function ContinueWatchingRow({
  entries,
  onSelect,
}: ContinueWatchingRowProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto px-6 py-5">
        <h2 className="mb-3 text-fluid-sm font-medium text-text-muted">Continue Watching</h2>
        <div className="flex gap-4 overflow-x-auto">
          {entries.map((entry) => (
            <button
              key={entry.channel_id}
              onClick={() => onSelect(entry.channel_id)}
              className="flex w-40 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-bg text-left transition-shadow hover:shadow-lg"
            >
              <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                {entry.logo ? (
                  <img
                    src={entry.logo}
                    alt={entry.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-fluid-xl font-bold text-white">
                    {entry.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-fluid-sm font-medium text-text">{entry.name}</p>
                {entry.content_type === 'series' &&
                  entry.season_number != null &&
                  entry.episode_num != null && (
                    <p className="truncate text-fluid-xs text-text-muted">
                      T{entry.season_number} E{entry.episode_num}
                    </p>
                  )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default ContinueWatchingRow;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors (this component isn't wired into `MainScreen.tsx` until Task 11, so it just needs to compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/ContinueWatchingRow.tsx
git commit -m "feat(frontend): add ContinueWatchingRow component"
```

---

### Task 11: Wire `ContinueWatchingRow` and the episode-playback signature into `MainScreen`

**Files:**
- Modify: `src/components/MainScreen.tsx`

**Interfaces:**
- Consumes: `ContinueWatchingRow` (Task 10); `continueWatching`/`loadContinueWatching` store fields (Task 8); `useChannelPlayback().playEpisode` new signature (Task 9)
- Produces: `handlePlayEpisode` with new signature `(episodeId: string, extension: string, title: string, seasonNumber: number, episodeNum: number, remainingEpisodes?) => Promise<void>` — passed to `SeriesView.onPlayEpisode` (Task 12 depends on this)
- Produces: `SeriesView` now receives a `channelId` prop (Task 12 depends on this)

- [ ] **Step 1: Import the new component and store fields**

At the top of `src/components/MainScreen.tsx`, add the import:

```tsx
import { ContinueWatchingRow } from './ContinueWatchingRow';
```

Add the store selectors, right after the existing `toggleChannelFavorite` selector:

```tsx
  const toggleChannelFavorite = usePlayerStore((s) => s.toggleChannelFavorite);
  const continueWatching = usePlayerStore((s) => s.continueWatching);
  const loadContinueWatching = usePlayerStore((s) => s.loadContinueWatching);
```

- [ ] **Step 2: Load continue-watching on mount / playlist change**

Add a new effect near the other `useEffect`s (after the "Check for stale playlists on mount" effect):

```tsx
  // Load continue-watching entries for the active playlist
  useEffect(() => {
    if (!currentPlaylist?.id) return;
    loadContinueWatching(currentPlaylist.id);
  }, [currentPlaylist?.id, loadContinueWatching]);
```

- [ ] **Step 3: Add the selection handler**

Add near `handlePlayChannel` (after its definition):

```tsx
  const handleSelectContinueWatching = useCallback(
    (channelId: number) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;

      if (channel.content_type === 'series') {
        setSelectedSeries(channel);
      } else {
        handlePlayChannel(channel);
      }
    },
    [channels, handlePlayChannel]
  );
```

- [ ] **Step 4: Extend `handlePlayEpisode` to carry season/episode number**

Replace:

```tsx
  const handlePlayEpisode = useCallback(
    async (
      episodeId: string,
      extension: string,
      title: string,
      remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
    ) => {
      if (!currentPlaylist) return;
      try {
        await playEpisodeAction(episodeId, extension, title, currentPlaylist, remainingEpisodes);
      } catch (err) {
        logger.error('Failed to play episode:', err);
      }
    },
    [currentPlaylist, playEpisodeAction]
  );
```

with:

```tsx
  const handlePlayEpisode = useCallback(
    async (
      episodeId: string,
      extension: string,
      title: string,
      seasonNumber: number,
      episodeNum: number,
      remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
    ) => {
      if (!currentPlaylist || !selectedSeries?.id) return;
      try {
        await playEpisodeAction(
          selectedSeries.id,
          episodeId,
          extension,
          title,
          seasonNumber,
          episodeNum,
          currentPlaylist,
          remainingEpisodes
        );
      } catch (err) {
        logger.error('Failed to play episode:', err);
      }
    },
    [currentPlaylist, selectedSeries, playEpisodeAction]
  );
```

- [ ] **Step 5: Pass `channelId` to `SeriesView`**

In the `<SeriesView .../>` render block, add the `channelId` prop:

```tsx
    return (
      <SeriesView
        seriesId={seriesId}
        channelId={selectedSeries.id}
        seriesName={selectedSeries.name}
        serverUrl={currentPlaylist.url}
        username={currentPlaylist.xtream_username}
        password={currentPlaylist.xtream_password}
        onBack={() => setSelectedSeries(null)}
        onPlayEpisode={handlePlayEpisode}
      />
    );
```

- [ ] **Step 6: Render the row on the "All" tab**

Right after `<ContentTypeTabs activeFilter={contentTypeFilter} onFilterChange={setContentTypeFilter} />`, add:

```tsx
      {/* Content Type Tabs */}
      <ContentTypeTabs activeFilter={contentTypeFilter} onFilterChange={setContentTypeFilter} />

      {/* Continue Watching */}
      {contentTypeFilter === 'all' && (
        <ContinueWatchingRow entries={continueWatching} onSelect={handleSelectContinueWatching} />
      )}
```

- [ ] **Step 7: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors — this was the last call site still using the old `playEpisode`/`SeriesView` signatures from Tasks 6/9 (Task 12 still needs to update `SeriesView`'s own prop types, which will show as an error here until Task 12 lands — that's expected and resolved there).

- [ ] **Step 8: Commit**

```bash
git add src/components/MainScreen.tsx
git commit -m "feat(frontend): wire ContinueWatchingRow and updated episode-playback signature into MainScreen"
```

---

### Task 12: `SeriesView` resume banner

**Files:**
- Modify: `src/components/SeriesView.tsx`

**Interfaces:**
- Consumes: `getWatchProgress` (Task 6); `getRemainingEpisodes` (Task 7); `WatchProgress` type (Task 6)
- Produces: `SeriesView` now requires a `channelId: number` prop and calls `onPlayEpisode` with the extended `(episodeId, extension, title, seasonNumber, episodeNum, remainingEpisodes?)` signature — matches what `MainScreen.tsx` (Task 11) already passes.

- [ ] **Step 1: Update imports and props**

In `src/components/SeriesView.tsx`, change:

```tsx
import { useState, useEffect } from 'react';
import { usePlayerStore } from '../stores/player-store';
import { getSeriesInfo } from '../lib/tauri';
import { ChevronLeft, Play } from 'lucide-react';
import type { Episode } from '../types';
import { logger } from '../lib/logger';

interface SeriesViewProps {
  seriesId: number;
  seriesName: string;
  serverUrl: string;
  username: string;
  password: string;
  onBack: () => void;
  onPlayEpisode: (
    episodeId: string,
    extension: string,
    title: string,
    remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
  ) => void;
}
```

to:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/player-store';
import { getSeriesInfo, getWatchProgress } from '../lib/tauri';
import { getRemainingEpisodes } from '../lib/episodeQueue';
import { ChevronLeft, Play } from 'lucide-react';
import type { Episode, WatchProgress } from '../types';
import { logger } from '../lib/logger';

interface SeriesViewProps {
  seriesId: number;
  channelId: number;
  seriesName: string;
  serverUrl: string;
  username: string;
  password: string;
  onBack: () => void;
  onPlayEpisode: (
    episodeId: string,
    extension: string,
    title: string,
    seasonNumber: number,
    episodeNum: number,
    remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
  ) => void;
}
```

- [ ] **Step 2: Destructure `channelId` and add watch-progress state**

Change:

```tsx
export default function SeriesView({
  seriesId,
  seriesName: _seriesName,
  serverUrl,
  username,
  password,
  onBack,
  onPlayEpisode,
}: SeriesViewProps) {
  const currentSeries = usePlayerStore((s) => s.currentSeries);
  const selectedSeason = usePlayerStore((s) => s.selectedSeason);
  const setCurrentSeries = usePlayerStore((s) => s.setCurrentSeries);
  const setSelectedSeason = usePlayerStore((s) => s.setSelectedSeason);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
```

to:

```tsx
export default function SeriesView({
  seriesId,
  channelId,
  seriesName: _seriesName,
  serverUrl,
  username,
  password,
  onBack,
  onPlayEpisode,
}: SeriesViewProps) {
  const currentSeries = usePlayerStore((s) => s.currentSeries);
  const selectedSeason = usePlayerStore((s) => s.selectedSeason);
  const setCurrentSeries = usePlayerStore((s) => s.setCurrentSeries);
  const setSelectedSeason = usePlayerStore((s) => s.setSelectedSeason);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);
```

- [ ] **Step 3: Fetch watch progress alongside series info**

Change:

```tsx
  useEffect(() => {
    async function loadSeriesInfo() {
      try {
        setIsLoading(true);
        const info = await getSeriesInfo(serverUrl, username, password, seriesId);
        setCurrentSeries(info);
        // Auto-select first season
        if (info.seasons.length > 0) {
          setSelectedSeason(info.seasons[0].season_number);
        }
      } catch (err) {
        logger.error('Failed to load series info:', err);
        setError(err instanceof Error ? err.message : 'Failed to load series');
      } finally {
        setIsLoading(false);
      }
    }

    loadSeriesInfo();

    return () => {
      setCurrentSeries(null);
      setSelectedSeason(null);
    };
  }, [seriesId, serverUrl, username, password, setCurrentSeries, setSelectedSeason]);
```

to:

```tsx
  useEffect(() => {
    async function loadSeriesInfo() {
      try {
        setIsLoading(true);
        const [info, progress] = await Promise.all([
          getSeriesInfo(serverUrl, username, password, seriesId),
          getWatchProgress(channelId),
        ]);
        setCurrentSeries(info);
        setWatchProgress(progress);
        // Auto-select first season
        if (info.seasons.length > 0) {
          setSelectedSeason(info.seasons[0].season_number);
        }
      } catch (err) {
        logger.error('Failed to load series info:', err);
        setError(err instanceof Error ? err.message : 'Failed to load series');
      } finally {
        setIsLoading(false);
      }
    }

    loadSeriesInfo();

    return () => {
      setCurrentSeries(null);
      setSelectedSeason(null);
      setWatchProgress(null);
    };
  }, [seriesId, channelId, serverUrl, username, password, setCurrentSeries, setSelectedSeason]);
```

- [ ] **Step 4: Add the Continue/Start Over handlers**

Add after the `loadSeriesInfo` effect, before the `if (isLoading)` early return:

```tsx
  const handleContinue = useCallback(() => {
    if (!watchProgress?.episode_id || !currentSeries) return;

    const seasonKey = String(watchProgress.season_number ?? '');
    const seasonEpisodes = currentSeries.episodes[seasonKey] ?? [];
    const remaining = getRemainingEpisodes(seasonEpisodes, watchProgress.episode_id);
    const queue =
      remaining.length > 0
        ? remaining
        : [
            {
              id: watchProgress.episode_id,
              title: watchProgress.episode_title ?? '',
              extension: watchProgress.episode_extension ?? '',
            },
          ];

    onPlayEpisode(
      watchProgress.episode_id,
      watchProgress.episode_extension ?? '',
      watchProgress.episode_title ?? '',
      watchProgress.season_number ?? 1,
      watchProgress.episode_num ?? 1,
      queue
    );
  }, [watchProgress, currentSeries, onPlayEpisode]);

  const handleRestart = useCallback(() => {
    if (!currentSeries || currentSeries.seasons.length === 0) return;

    const firstSeasonNumber = currentSeries.seasons[0].season_number;
    const seasonEpisodes = [...(currentSeries.episodes[firstSeasonNumber] ?? [])].sort(
      (a, b) => a.episode_num - b.episode_num
    );
    const firstEpisode = seasonEpisodes[0];
    if (!firstEpisode) return;

    const queue = getRemainingEpisodes(seasonEpisodes, firstEpisode.id);
    onPlayEpisode(
      firstEpisode.id,
      firstEpisode.container_extension,
      firstEpisode.title,
      firstEpisode.season,
      firstEpisode.episode_num,
      queue
    );
  }, [currentSeries, onPlayEpisode]);
```

- [ ] **Step 5: Render the resume banner**

In the main return block, insert the banner right after the header `</div>` and before the "Season Selector" comment:

```tsx
      {/* Resume banner */}
      {watchProgress && (
        <div className="border-b border-border bg-surface-hover">
          <div className="mx-auto flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <p className="text-fluid-sm text-text">
              Continue: S{watchProgress.season_number} E{watchProgress.episode_num}
              {watchProgress.episode_title ? ` — ${watchProgress.episode_title}` : ''}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleContinue}
                className="rounded-lg bg-accent px-4 py-2 text-fluid-sm font-medium text-white hover:bg-accent-hover"
              >
                Continue
              </button>
              <button
                onClick={handleRestart}
                className="rounded-lg bg-surface-hover px-4 py-2 text-fluid-sm font-medium text-text hover:bg-border"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Season Selector */}
```

- [ ] **Step 6: Use `getRemainingEpisodes` in `EpisodeCard`'s click handler and pass season/episode**

Replace the `EpisodeCard` invocation inside the episode grid:

```tsx
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  onPlay={() =>
                    // Remaining-episodes queue is only needed when the user
                    // actually presses play, not on every render of every card.
                    onPlayEpisode(
                      episode.id,
                      episode.container_extension,
                      episode.title,
                      selectedSeasonEpisodes
                        .slice(index)
                        .sort((a, b) => a.episode_num - b.episode_num)
                        .map((ep) => ({
                          id: ep.id,
                          title: ep.title,
                          extension: ep.container_extension,
                        }))
                    )
                  }
                />
```

with:

```tsx
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  onPlay={() =>
                    // Remaining-episodes queue is only needed when the user
                    // actually presses play, not on every render of every card.
                    onPlayEpisode(
                      episode.id,
                      episode.container_extension,
                      episode.title,
                      episode.season,
                      episode.episode_num,
                      getRemainingEpisodes(selectedSeasonEpisodes, episode.id)
                    )
                  }
                />
```

Since `index` is no longer used in this map callback, also drop it from the `.map` signature:

```tsx
              {selectedSeasonEpisodes.map((episode, index) => (
```

becomes:

```tsx
              {selectedSeasonEpisodes.map((episode) => (
```

- [ ] **Step 7: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS, no errors anywhere in the frontend — this was the last remaining call site from Tasks 6/9/11.

- [ ] **Step 8: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/components/SeriesView.tsx
git commit -m "feat(frontend): add resume/restart banner to SeriesView"
```

---

### Task 13: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises the full stack built in Tasks 1-12.

- [ ] **Step 1: Full build**

Run: `cd src-tauri && cargo test && cargo check`
Expected: PASS, no warnings.

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, no errors.

- [ ] **Step 2: Manual smoke test**

Run the app in dev mode with `npm run tauri dev`. With a playlist that has live channels, VOD, and series:

1. Play a live channel or a movie → go back to the "All" tab → confirm it now appears in the "Continue Watching" row.
2. Open a series with no prior progress → confirm no resume banner appears.
3. Play episode 2 of season 1 → stop → reopen the same series → confirm the banner reads "Continue: S1 E2" and clicking **Continue** replays from episode 2 onward.
4. Click **Start Over** → confirm playback starts at episode 1, and reopening the series again now shows "Continue: S1 E1".
5. Confirm the series also now shows up in the "Continue Watching" row with the "T{season} E{episode}" subtitle.
6. Delete or switch away from the playlist used above → confirm the "Continue Watching" row is empty for a different/empty playlist (cascade delete / playlist scoping).

- [ ] **Step 3: Report results**

No commit for this task — if all checks pass, the feature is complete. If step 2 surfaces a bug, fix it as a follow-up commit referencing which numbered check failed.

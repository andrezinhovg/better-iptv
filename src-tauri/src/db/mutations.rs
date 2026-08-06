use rusqlite::{Connection, Result, params};
use log::debug;
use std::time::Instant;
use super::models::*;
use crate::utils::generate_epg_id_swedish;

// ========== Playlist Mutations ==========

pub fn create_playlist(conn: &Connection, playlist: &Playlist) -> Result<i64> {
    conn.execute(
        "INSERT INTO playlists (name, url, file_path, auto_refresh, xtream_username, xtream_password)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            playlist.name,
            playlist.url,
            playlist.file_path,
            playlist.auto_refresh,
            playlist.xtream_username,
            playlist.xtream_password
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_playlist(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn rename_playlist(conn: &Connection, playlist_id: i64, new_name: &str) -> Result<()> {
    conn.execute(
        "UPDATE playlists SET name = ?1 WHERE id = ?2",
        params![new_name, playlist_id],
    )?;
    Ok(())
}

// ========== Channel Mutations ==========

#[cfg(test)]
pub fn create_channel(conn: &Connection, channel: &Channel) -> Result<i64> {
    conn.execute(
        "INSERT INTO channels (playlist_id, name, url, logo, group_name, epg_id, tvg_name, content_type, sort_order, category_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            channel.playlist_id,
            channel.name,
            channel.url,
            channel.logo,
            channel.group_name,
            channel.epg_id,
            channel.tvg_name,
            channel.content_type,
            channel.sort_order,
            channel.category_order
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn create_channels_batch(conn: &Connection, channels: &[Channel]) -> Result<()> {
    let start = Instant::now();
    let tx = conn.unchecked_transaction()?;

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO channels (playlist_id, name, url, logo, group_name, epg_id, tvg_name, content_type, sort_order, category_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        )?;

        for channel in channels {
            stmt.execute(params![
                channel.playlist_id,
                channel.name,
                channel.url,
                channel.logo,
                channel.group_name,
                channel.epg_id,
                channel.tvg_name,
                channel.content_type,
                channel.sort_order,
                channel.category_order
            ])?;
        }
    }

    tx.commit()?;
    debug!("create_channels_batch: {} channels in {:?}", channels.len(), start.elapsed());
    Ok(())
}

pub fn toggle_favorite(conn: &Connection, channel_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE channels SET is_favorite = NOT is_favorite WHERE id = ?1",
        params![channel_id],
    )?;
    Ok(())
}

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

// ========== Settings Mutations ==========

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        params![key, value],
    )?;
    Ok(())
}

/// Delete a setting by key
pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

// ========== Playlist Refresh Mutations ==========

/// Update the last_updated timestamp of a playlist to now
pub fn update_playlist_last_updated(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE playlists SET last_updated = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

/// Extract stream_id from an Xtream-style URL.
/// Pattern: /{live|movie|series}/user/pass/{stream_id}.{ext}
fn extract_stream_id_from_url(url: &str) -> Option<i64> {
    let path = url.rsplit('/').next()?;
    let id_str = path.split('.').next()?;
    id_str.parse::<i64>().ok()
}

/// Merge new channels into an existing playlist, preserving favorites.
///
/// - If `match_by_stream_id` is true (Xtream), channels are matched by stream_id extracted from URL.
/// - Otherwise (M3U), channels are matched by `(name, group_name)` with `name`-only fallback.
///
/// Returns counts of added, updated, and removed channels.
pub fn merge_channels(
    conn: &Connection,
    playlist_id: i64,
    new_channels: &[Channel],
    match_by_stream_id: bool,
) -> Result<MergeResult> {
    use std::collections::HashMap;
    use std::collections::HashSet;

    let start = Instant::now();
    let tx = conn.unchecked_transaction()?;

    // 1. Load existing channels for this playlist
    let mut stmt = tx.prepare(
        "SELECT id, name, url, group_name, is_favorite, content_type FROM channels WHERE playlist_id = ?1",
    )?;

    struct ExistingChannel {
        id: i64,
        name: String,
        url: String,
        group_name: Option<String>,
        is_favorite: bool,
        content_type: String,
    }

    let existing: Vec<ExistingChannel> = stmt
        .query_map(params![playlist_id], |row| {
            Ok(ExistingChannel {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                group_name: row.get(3)?,
                is_favorite: row.get(4)?,
                content_type: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    drop(stmt);

    // 2. Build lookup map from existing channels
    // Maps a match key -> (db_id, is_favorite)
    let mut lookup: HashMap<String, (i64, bool)> = HashMap::new();

    if match_by_stream_id {
        // Xtream stream_id/series_id numbering is per-endpoint, not global: the
        // same numeric id can independently identify a live stream, a VOD, and
        // a series. Scope the key by content_type too, or unrelated items (and
        // whichever of them happens to be favorited) collide onto one row and
        // get overwritten or deleted as "removed" on every refresh.
        for ch in &existing {
            if let Some(sid) = extract_stream_id_from_url(&ch.url) {
                lookup.insert(format!("sid:{}:{}", ch.content_type, sid), (ch.id, ch.is_favorite));
            }
        }
    } else {
        // M3U: primary key = (name, group_name), fallback = name only
        // Insert name-only first so (name, group_name) wins if both exist
        for ch in &existing {
            lookup.insert(format!("name:{}", ch.name), (ch.id, ch.is_favorite));
        }
        for ch in &existing {
            let key = format!(
                "namegroup:{}|{}",
                ch.name,
                ch.group_name.as_deref().unwrap_or("")
            );
            lookup.insert(key, (ch.id, ch.is_favorite));
        }
    }

    // 3. Process new channels
    let mut matched_ids: HashSet<i64> = HashSet::new();
    let mut added: usize = 0;
    let mut updated: usize = 0;

    {
        let mut update_stmt = tx.prepare_cached(
            "UPDATE channels SET url=?1, logo=?2, group_name=?3, epg_id=?4, tvg_name=?5, sort_order=?6, category_order=?7 WHERE id=?8",
        )?;

        let mut insert_stmt = tx.prepare_cached(
            "INSERT INTO channels (playlist_id, name, url, logo, group_name, epg_id, tvg_name, content_type, is_favorite, sort_order, category_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )?;

        for ch in new_channels {
            // Try to find a match
            let matched = if match_by_stream_id {
                extract_stream_id_from_url(&ch.url)
                    .and_then(|sid| lookup.get(&format!("sid:{}:{}", ch.content_type, sid)))
            } else {
                // Try (name, group_name) first, then name only
                let key = format!(
                    "namegroup:{}|{}",
                    ch.name,
                    ch.group_name.as_deref().unwrap_or("")
                );
                lookup
                    .get(&key)
                    .or_else(|| lookup.get(&format!("name:{}", ch.name)))
            };

            if let Some(&(db_id, _is_favorite)) = matched {
                // Update existing channel (preserve is_favorite)
                update_stmt.execute(params![
                    ch.url,
                    ch.logo,
                    ch.group_name,
                    ch.epg_id,
                    ch.tvg_name,
                    ch.sort_order,
                    ch.category_order,
                    db_id,
                ])?;
                matched_ids.insert(db_id);
                updated += 1;
            } else {
                // Insert new channel
                insert_stmt.execute(params![
                    playlist_id,
                    ch.name,
                    ch.url,
                    ch.logo,
                    ch.group_name,
                    ch.epg_id,
                    ch.tvg_name,
                    ch.content_type,
                    false, // new channels start unfavorited
                    ch.sort_order,
                    ch.category_order,
                ])?;
                added += 1;
            }
        }
    }

    // 4. Delete unmatched old channels.
    // Must delete by explicit stale id, not "playlist_id AND NOT IN matched_ids":
    // matched_ids only ever holds ids from `existing` (loaded before step 3), so
    // an inverse match against the whole playlist would also catch every row
    // just inserted in step 3 — silently wiping out "added" channels in the
    // same transaction that created them.
    let stale_ids: Vec<i64> = existing
        .iter()
        .map(|ch| ch.id)
        .filter(|id| !matched_ids.contains(id))
        .collect();
    let removed = stale_ids.len();
    if removed > 0 {
        // A `DELETE ... WHERE id IN (?, ?, ..., ?)` with one bound param per row
        // blows past SQLite's expression-depth limit (SQLITE_MAX_EXPR_DEPTH,
        // default 1000) for large playlists. Stage the ids in a temp table
        // instead, so the DELETE only ever references a single subquery.
        tx.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS channels_to_delete (id INTEGER PRIMARY KEY);
             DELETE FROM channels_to_delete;",
        )?;

        {
            let mut delete_stage_stmt =
                tx.prepare_cached("INSERT INTO channels_to_delete (id) VALUES (?1)")?;
            for id in &stale_ids {
                delete_stage_stmt.execute(params![id])?;
            }
        }

        tx.execute(
            "DELETE FROM channels WHERE id IN (SELECT id FROM channels_to_delete)",
            [],
        )?;

        tx.execute_batch("DELETE FROM channels_to_delete;")?;
    }

    tx.commit()?;

    let total = added + updated;
    debug!("merge_channels: added={}, updated={}, removed={} in {:?}", added, updated, removed, start.elapsed());
    Ok(MergeResult {
        added,
        updated,
        removed,
        total,
    })
}

// ========== EPG Mutations ==========

/// Update EPG IDs for all Swedish channels based on their names
/// Uses a transaction with prepared statement for batch efficiency
pub fn update_channel_epg_ids(conn: &Connection) -> Result<usize> {
    // Get all live channels without EPG IDs
    let mut stmt = conn.prepare(
        "SELECT id, name FROM channels WHERE content_type = 'live' AND epg_id IS NULL"
    )?;
    let channels: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt); // Explicitly drop to release borrow

    if channels.is_empty() {
        return Ok(0);
    }

    // Batch update using transaction for ~100-1000x performance improvement
    let tx = conn.unchecked_transaction()?;
    let mut updated_count = 0;

    {
        let mut update_stmt = tx.prepare_cached(
            "UPDATE channels SET epg_id = ?1 WHERE id = ?2"
        )?;

        for (id, name) in &channels {
            if let Some(epg_id) = generate_epg_id_swedish(name) {
                update_stmt.execute(params![epg_id, id])?;
                updated_count += 1;
            }
        }
    }

    tx.commit()?;
    Ok(updated_count)
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{setup_test_db, create_test_playlist, create_test_channel};
    use crate::db::queries::*;

    // ========== Playlist Tests ==========

    #[test]
    fn test_create_playlist_returns_id() {
        let conn = setup_test_db();
        let id = create_test_playlist(&conn, "Test Playlist");
        assert!(id > 0);
    }

    #[test]
    fn test_create_multiple_playlists() {
        let conn = setup_test_db();
        let id1 = create_test_playlist(&conn, "Playlist 1");
        let id2 = create_test_playlist(&conn, "Playlist 2");
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_delete_playlist() {
        let conn = setup_test_db();
        let id = create_test_playlist(&conn, "To Delete");

        delete_playlist(&conn, id).unwrap();

        let playlists = get_playlists(&conn).unwrap();
        assert!(playlists.is_empty());
    }

    #[test]
    fn test_rename_playlist() {
        let conn = setup_test_db();
        let id = create_test_playlist(&conn, "Old Name");

        rename_playlist(&conn, id, "New Name").unwrap();

        let playlists = get_playlists(&conn).unwrap();
        assert_eq!(playlists[0].name, "New Name");
    }

    // ========== Channel Tests ==========

    #[test]
    fn test_create_channel() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");
        let channel_id = create_test_channel(&conn, playlist_id, "Test Channel");

        assert!(channel_id > 0);
    }

    #[test]
    fn test_toggle_favorite() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");
        let channel_id = create_test_channel(&conn, playlist_id, "Test Channel");

        // Initially not favorite
        let channels = get_channels(&conn, Some(playlist_id)).unwrap();
        assert!(!channels[0].is_favorite);

        // Toggle to favorite
        toggle_favorite(&conn, channel_id).unwrap();
        let channels = get_channels(&conn, Some(playlist_id)).unwrap();
        assert!(channels[0].is_favorite);

        // Toggle back
        toggle_favorite(&conn, channel_id).unwrap();
        let channels = get_channels(&conn, Some(playlist_id)).unwrap();
        assert!(!channels[0].is_favorite);
    }

    #[test]
    fn test_batch_create_channels() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");

        let channels: Vec<Channel> = (0..100)
            .map(|i| Channel {
                id: None,
                playlist_id,
                name: format!("Channel {}", i),
                url: format!("http://example.com/stream{}.m3u8", i),
                logo: None,
                group_name: Some("Batch Test".to_string()),
                epg_id: None,
                tvg_name: None,
                content_type: "live".to_string(),
                is_favorite: false,
                sort_order: i,
                category_order: 0,
                created_at: None,
            })
            .collect();

        create_channels_batch(&conn, &channels).unwrap();

        let stored = get_channels(&conn, Some(playlist_id)).unwrap();
        assert_eq!(stored.len(), 100);
    }

    /// Regression test: a `NOT IN` clause built with one bound parameter per row
    /// used to blow past SQLite's expression-depth limit (default 1000) on large
    /// playlists, surfacing a raw SQL error to the user during refresh.
    #[test]
    fn test_merge_channels_deletes_stale_rows_in_large_playlist() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Large Playlist");

        const KEEP_COUNT: i32 = 1500;
        let existing: Vec<Channel> = (0..KEEP_COUNT + 1)
            .map(|i| Channel {
                id: None,
                playlist_id,
                name: format!("Channel {}", i),
                url: format!("http://example.com/stream{}.m3u8", i),
                logo: None,
                group_name: Some("Large Group".to_string()),
                epg_id: None,
                tvg_name: None,
                content_type: "live".to_string(),
                is_favorite: false,
                sort_order: i,
                category_order: 0,
                created_at: None,
            })
            .collect();
        create_channels_batch(&conn, &existing).unwrap();
        assert_eq!(
            get_channels(&conn, Some(playlist_id)).unwrap().len(),
            (KEEP_COUNT + 1) as usize
        );

        // Refresh matches all but one channel (by name+group_name), so it must
        // delete exactly one stale row out of a `keep` set of 1500.
        let refreshed: Vec<Channel> = existing[..KEEP_COUNT as usize].to_vec();
        let result = merge_channels(&conn, playlist_id, &refreshed, false).unwrap();

        assert_eq!(result.removed, 1);
        assert_eq!(result.updated, KEEP_COUNT as usize);
        assert_eq!(
            get_channels(&conn, Some(playlist_id)).unwrap().len(),
            KEEP_COUNT as usize
        );
    }

    /// Regression test: the stale-row cleanup used to delete by
    /// `id NOT IN (matched_ids)` over the whole playlist. Since matched_ids
    /// only ever holds ids from rows loaded *before* this refresh, that
    /// inverse match also caught every row just inserted for a brand new
    /// channel — wiping out "added" channels in the very transaction that
    /// created them, but only when the same refresh also had a genuinely
    /// stale row to remove (removed == 0 skipped the delete branch entirely,
    /// which is why this went unnoticed for a while).
    #[test]
    fn test_merge_channels_keeps_new_rows_when_also_removing_stale_ones() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Playlist");

        let make = |name: &str| Channel {
            id: None,
            playlist_id,
            name: name.to_string(),
            url: format!("http://example.com/{}.m3u8", name),
            logo: None,
            group_name: None,
            epg_id: None,
            tvg_name: None,
            content_type: "live".to_string(),
            is_favorite: false,
            sort_order: 0,
            category_order: 0,
            created_at: None,
        };

        create_channels_batch(&conn, &[make("Stays"), make("Goes")]).unwrap();

        // Refresh: "Goes" is gone (stale, must be removed) and "New" appears
        // for the first time (must be added and, critically, must survive).
        let refreshed = vec![make("Stays"), make("New")];
        let result = merge_channels(&conn, playlist_id, &refreshed, false).unwrap();

        assert_eq!(result.added, 1);
        assert_eq!(result.removed, 1);

        let stored = get_channels(&conn, Some(playlist_id)).unwrap();
        let names: Vec<&str> = stored.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(stored.len(), 2, "the newly added channel must not be deleted alongside the stale one");
        assert!(names.contains(&"Stays"));
        assert!(names.contains(&"New"));
    }

    /// Regression test: Xtream stream_id/series_id numbering is per-endpoint,
    /// not global, so a VOD and a series can legitimately share the same
    /// numeric id. Refreshing must not let one collide onto the other's row
    /// (which used to overwrite content and could silently drop a favorite).
    #[test]
    fn test_merge_channels_keeps_distinct_content_types_with_colliding_stream_id() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Xtream Playlist");

        let make = |content_type: &str, name: &str| Channel {
            id: None,
            playlist_id,
            name: name.to_string(),
            url: format!("http://example.com/{}/user/pass/100.mp4", content_type),
            logo: None,
            group_name: None,
            epg_id: None,
            tvg_name: None,
            content_type: content_type.to_string(),
            is_favorite: false,
            sort_order: 0,
            category_order: 0,
            created_at: None,
        };

        let existing = vec![make("vod", "Some Movie"), make("series", "Some Series")];
        create_channels_batch(&conn, &existing).unwrap();

        // Mark the series as a favorite, the way a real user would.
        let series_id = get_channels(&conn, Some(playlist_id))
            .unwrap()
            .iter()
            .find(|c| c.content_type == "series")
            .unwrap()
            .id
            .unwrap();
        toggle_favorite(&conn, series_id).unwrap();

        // Refresh sends back the same two items (same colliding stream_id 100).
        let refreshed = vec![make("vod", "Some Movie"), make("series", "Some Series")];
        let result = merge_channels(&conn, playlist_id, &refreshed, true).unwrap();

        assert_eq!(result.removed, 0);
        assert_eq!(result.updated, 2);

        let stored = get_channels(&conn, Some(playlist_id)).unwrap();
        assert_eq!(stored.len(), 2, "vod and series with the same stream_id must stay separate rows");

        let series = stored.iter().find(|c| c.content_type == "series").unwrap();
        assert_eq!(series.name, "Some Series");
        assert!(series.is_favorite, "favorite flag must survive the refresh");
    }

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

    // ========== Settings Tests ==========

    #[test]
    fn test_get_set_setting() {
        let conn = setup_test_db();

        // Initially empty
        let value = get_setting(&conn, "theme").unwrap();
        assert!(value.is_none());

        // Set and get
        set_setting(&conn, "theme", "dark").unwrap();
        let value = get_setting(&conn, "theme").unwrap();
        assert_eq!(value, Some("dark".to_string()));
    }

    #[test]
    fn test_update_setting() {
        let conn = setup_test_db();

        set_setting(&conn, "theme", "light").unwrap();
        set_setting(&conn, "theme", "dark").unwrap();

        let value = get_setting(&conn, "theme").unwrap();
        assert_eq!(value, Some("dark".to_string()));
    }

    // ========== Cascade Delete Tests ==========

    #[test]
    fn test_delete_playlist_cascades_to_channels() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");
        create_test_channel(&conn, playlist_id, "Channel 1");
        create_test_channel(&conn, playlist_id, "Channel 2");

        // Verify channels exist
        let channels = get_channels(&conn, Some(playlist_id)).unwrap();
        assert_eq!(channels.len(), 2);

        // Delete playlist
        delete_playlist(&conn, playlist_id).unwrap();

        // Verify channels are deleted
        let all_channels = get_channels(&conn, None).unwrap();
        assert!(all_channels.is_empty());
    }
}

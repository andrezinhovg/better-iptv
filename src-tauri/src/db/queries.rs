use rusqlite::{Connection, Result, Row, params};
use std::collections::HashMap;
use super::models::*;

// ========== Channel Query Helpers ==========

/// SQL columns for channel SELECT queries (in order)
const CHANNEL_SELECT_COLUMNS: &str =
    "id, playlist_id, name, url, logo, group_name, epg_id, tvg_name, content_type, is_favorite, sort_order, category_order, created_at";

/// Maps a database row to a Channel struct
fn map_channel_row(row: &Row) -> rusqlite::Result<Channel> {
    Ok(Channel {
        id: row.get(0)?,
        playlist_id: row.get(1)?,
        name: row.get(2)?,
        url: row.get(3)?,
        logo: row.get(4)?,
        group_name: row.get(5)?,
        epg_id: row.get(6)?,
        tvg_name: row.get(7)?,
        content_type: row.get(8)?,
        is_favorite: row.get(9)?,
        sort_order: row.get(10)?,
        category_order: row.get(11)?,
        created_at: row.get(12)?,
    })
}

// ========== Playlist Query Helpers ==========

const PLAYLIST_SELECT_COLUMNS: &str =
    "id, name, url, file_path, last_updated, auto_refresh, xtream_username, xtream_password, created_at";

fn map_playlist_row(row: &Row) -> rusqlite::Result<Playlist> {
    Ok(Playlist {
        id: row.get(0)?,
        name: row.get(1)?,
        url: row.get(2)?,
        file_path: row.get(3)?,
        last_updated: row.get(4)?,
        auto_refresh: row.get(5)?,
        xtream_username: row.get(6)?,
        xtream_password: row.get(7)?,
        created_at: row.get(8)?,
    })
}

// ========== Playlist Queries ==========

pub fn get_playlists(conn: &Connection) -> Result<Vec<Playlist>> {
    let sql = format!(
        "SELECT {} FROM playlists ORDER BY created_at DESC",
        PLAYLIST_SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let playlists = stmt.query_map([], map_playlist_row)?
        .collect::<Result<Vec<_>>>()?;
    Ok(playlists)
}

/// Get a single playlist by ID
pub fn get_playlist_by_id(conn: &Connection, id: i64) -> Result<Option<Playlist>> {
    let sql = format!(
        "SELECT {} FROM playlists WHERE id = ?1",
        PLAYLIST_SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params![id], map_playlist_row)?;
    rows.next().transpose()
}

// ========== Channel Queries ==========

pub fn get_channels(conn: &Connection, playlist_id: Option<i64>) -> Result<Vec<Channel>> {
    if let Some(pid) = playlist_id {
        let sql = format!(
            "SELECT {} FROM channels WHERE playlist_id = ?1 ORDER BY sort_order, name",
            CHANNEL_SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let channels = stmt.query_map(params![pid], map_channel_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(channels)
    } else {
        let sql = format!(
            "SELECT {} FROM channels ORDER BY sort_order, name",
            CHANNEL_SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let channels = stmt.query_map([], map_channel_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(channels)
    }
}

pub fn get_favorites(conn: &Connection) -> Result<Vec<Channel>> {
    let sql = format!(
        "SELECT {} FROM channels WHERE is_favorite = 1 ORDER BY name",
        CHANNEL_SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;

    let channels = stmt.query_map([], map_channel_row)?
        .collect::<Result<Vec<_>>>()?;

    Ok(channels)
}

// ========== Settings Queries ==========

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;

    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

/// Get multiple settings in a single query for efficiency
pub fn get_multiple_settings(conn: &Connection, keys: &[&str]) -> Result<HashMap<String, String>> {
    if keys.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT key, value FROM settings WHERE key IN ({})", placeholders);

    let mut stmt = conn.prepare(&sql)?;
    let result = stmt.query_map(rusqlite::params_from_iter(keys), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?
    .collect::<Result<HashMap<_, _>, _>>()?;

    Ok(result)
}

// ========== EPG Queries ==========

/// Get the total count of EPG programs in the database
pub fn get_epg_program_count(conn: &Connection) -> Result<usize> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM epg_programs", [], |row| row.get(0))?;
    Ok(count as usize)
}

// ========== Stale Playlist Queries ==========

/// Get playlists that have a URL and haven't been updated in the given number of days
pub fn get_stale_playlists(conn: &Connection, days: i64) -> Result<Vec<Playlist>> {
    let sql = format!(
        "SELECT {} FROM playlists
         WHERE url IS NOT NULL
           AND (last_updated IS NULL OR last_updated < datetime('now', ?1))
         ORDER BY created_at DESC",
        PLAYLIST_SELECT_COLUMNS
    );
    let modifier = format!("-{} days", days);
    let mut stmt = conn.prepare(&sql)?;
    let playlists = stmt.query_map(params![modifier], map_playlist_row)?
        .collect::<Result<Vec<_>>>()?;
    Ok(playlists)
}

// ========== Category Queries ==========

/// Get all unique category/group names for a playlist, optionally filtered by content type
/// Categories are ordered by their original provider order (category_order), not alphabetically
pub fn get_channel_groups(
    conn: &Connection,
    playlist_id: i64,
    content_type: Option<&str>,
) -> Result<Vec<String>> {
    // Use MIN(category_order) to get the order from provider
    // Group by group_name to get distinct values, order by the min category_order
    if let Some(ct) = content_type {
        let sql = "SELECT group_name, MIN(category_order) as cat_order FROM channels
                   WHERE playlist_id = ?1 AND group_name IS NOT NULL AND group_name != ''
                   AND content_type = ?2
                   GROUP BY group_name
                   ORDER BY cat_order, group_name";
        let mut stmt = conn.prepare(sql)?;
        let groups = stmt.query_map(params![playlist_id, ct], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(groups)
    } else {
        let sql = "SELECT group_name, MIN(category_order) as cat_order FROM channels
                   WHERE playlist_id = ?1 AND group_name IS NOT NULL AND group_name != ''
                   GROUP BY group_name
                   ORDER BY cat_order, group_name";
        let mut stmt = conn.prepare(sql)?;
        let groups = stmt.query_map(params![playlist_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(groups)
    }
}

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
    let sql = "SELECT wp.channel_id, c.name, c.logo, wp.content_type,
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
                content_type: row.get(3)?,
                episode_id: row.get(4)?,
                episode_extension: row.get(5)?,
                season_number: row.get(6)?,
                episode_num: row.get(7)?,
                episode_title: row.get(8)?,
                watched_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(entries)
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{setup_test_db, create_test_playlist, create_test_channel};
    use crate::db::mutations::{create_channel, toggle_favorite, set_setting};

    // ========== Playlist Tests ==========

    #[test]
    fn test_get_playlists_returns_all() {
        let conn = setup_test_db();
        create_test_playlist(&conn, "Playlist 1");
        create_test_playlist(&conn, "Playlist 2");

        let playlists = get_playlists(&conn).unwrap();
        assert_eq!(playlists.len(), 2);
    }

    // ========== Channel Tests ==========

    #[test]
    fn test_get_channels_by_playlist() {
        let conn = setup_test_db();
        let playlist1 = create_test_playlist(&conn, "Playlist 1");
        let playlist2 = create_test_playlist(&conn, "Playlist 2");

        create_test_channel(&conn, playlist1, "Channel 1");
        create_test_channel(&conn, playlist1, "Channel 2");
        create_test_channel(&conn, playlist2, "Channel 3");

        let channels1 = get_channels(&conn, Some(playlist1)).unwrap();
        let channels2 = get_channels(&conn, Some(playlist2)).unwrap();

        assert_eq!(channels1.len(), 2);
        assert_eq!(channels2.len(), 1);
    }

    #[test]
    fn test_get_favorites() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");
        let channel1 = create_test_channel(&conn, playlist_id, "Channel 1");
        let _channel2 = create_test_channel(&conn, playlist_id, "Channel 2");

        toggle_favorite(&conn, channel1).unwrap();

        let favorites = get_favorites(&conn).unwrap();
        assert_eq!(favorites.len(), 1);
        assert_eq!(favorites[0].name, "Channel 1");
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
    fn test_get_multiple_settings() {
        let conn = setup_test_db();

        set_setting(&conn, "theme", "dark").unwrap();
        set_setting(&conn, "volume", "80").unwrap();
        set_setting(&conn, "language", "sv").unwrap();

        let settings = get_multiple_settings(&conn, &["theme", "volume"]).unwrap();

        assert_eq!(settings.len(), 2);
        assert_eq!(settings.get("theme"), Some(&"dark".to_string()));
        assert_eq!(settings.get("volume"), Some(&"80".to_string()));
    }

    #[test]
    fn test_get_multiple_settings_empty() {
        let conn = setup_test_db();

        let settings = get_multiple_settings(&conn, &[]).unwrap();
        assert!(settings.is_empty());
    }

    // ========== Category Tests ==========

    #[test]
    fn test_get_channel_groups() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");

        // Create channels with different groups - note category_order to test ordering
        let groups = [("Sweden", 0), ("Norway", 1), ("Denmark", 2)];
        for (i, (group, cat_order)) in groups.iter().enumerate() {
            let channel = Channel {
                id: None,
                playlist_id,
                name: format!("Channel {}", i),
                url: "http://example.com/stream.m3u8".to_string(),
                logo: None,
                group_name: Some(group.to_string()),
                epg_id: None,
                tvg_name: None,
                content_type: "live".to_string(),
                is_favorite: false,
                sort_order: i as i32,
                category_order: *cat_order,
                created_at: None,
            };
            create_channel(&conn, &channel).unwrap();
        }

        let result = get_channel_groups(&conn, playlist_id, None).unwrap();
        assert_eq!(result.len(), 3);
        // Check that order is preserved (Sweden first, then Norway, then Denmark)
        assert_eq!(result[0], "Sweden");
        assert_eq!(result[1], "Norway");
        assert_eq!(result[2], "Denmark");
    }

    #[test]
    fn test_get_channel_groups_by_content_type() {
        let conn = setup_test_db();
        let playlist_id = create_test_playlist(&conn, "Test Playlist");

        // Create live channel
        let live_channel = Channel {
            id: None,
            playlist_id,
            name: "Live Channel".to_string(),
            url: "http://example.com/live.m3u8".to_string(),
            logo: None,
            group_name: Some("Live Group".to_string()),
            epg_id: None,
            tvg_name: None,
            content_type: "live".to_string(),
            is_favorite: false,
            sort_order: 0,
            category_order: 0,
            created_at: None,
        };
        create_channel(&conn, &live_channel).unwrap();

        // Create VOD channel
        let vod_channel = Channel {
            id: None,
            playlist_id,
            name: "VOD Channel".to_string(),
            url: "http://example.com/vod.m3u8".to_string(),
            logo: None,
            group_name: Some("VOD Group".to_string()),
            epg_id: None,
            tvg_name: None,
            content_type: "vod".to_string(),
            is_favorite: false,
            sort_order: 1,
            category_order: 0,
            created_at: None,
        };
        create_channel(&conn, &vod_channel).unwrap();

        // Filter by live
        let live_groups = get_channel_groups(&conn, playlist_id, Some("live")).unwrap();
        assert_eq!(live_groups.len(), 1);
        assert_eq!(live_groups[0], "Live Group");

        // Filter by vod
        let vod_groups = get_channel_groups(&conn, playlist_id, Some("vod")).unwrap();
        assert_eq!(vod_groups.len(), 1);
        assert_eq!(vod_groups[0], "VOD Group");
    }

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
        assert_eq!(result[0].logo.as_deref(), Some("http://example.com/poster.jpg"));
        assert_eq!(result[0].content_type, "vod");
    }
}

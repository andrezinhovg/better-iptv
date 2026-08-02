use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: Option<i64>,
    pub name: String,
    pub url: Option<String>,
    pub file_path: Option<String>,
    pub last_updated: Option<String>,
    pub auto_refresh: bool,
    pub xtream_username: Option<String>,
    pub xtream_password: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: Option<i64>,
    pub playlist_id: i64,
    pub name: String,
    pub url: String,
    pub logo: Option<String>,
    pub group_name: Option<String>,
    pub epg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub content_type: String, // "live", "vod", "series"
    pub is_favorite: bool,
    pub sort_order: i32,
    pub category_order: i32, // Order from provider's category list
    pub created_at: Option<String>,
}

/// Result of a merge-based playlist refresh
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub total: usize,
}

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

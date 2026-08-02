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

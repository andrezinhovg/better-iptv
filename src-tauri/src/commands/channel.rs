use crate::channel_domain;
use crate::db::models::Channel;
use crate::db::{queries, mutations};
use crate::error::AppError;
use crate::state::AppState;
use log::debug;
use tauri::State;

#[tauri::command]
pub async fn get_channels(
    state: State<'_, AppState>,
    playlist_id: Option<i64>,
) -> Result<Vec<Channel>, AppError> {
    if let Some(id) = playlist_id {
        channel_domain::validate_playlist_id(id)?;
    }

    let conn = state.pool.get()?;
    let channels = queries::get_channels(&conn, playlist_id)?;
    debug!("get_channels playlist_id={:?} -> {} channels", playlist_id, channels.len());
    Ok(channels)
}

#[tauri::command]
pub async fn get_channel_groups(
    state: State<'_, AppState>,
    playlist_id: i64,
    content_type: Option<String>,
) -> Result<Vec<String>, AppError> {
    channel_domain::validate_playlist_id(playlist_id)?;

    if let Some(ref ct) = content_type {
        channel_domain::validate_content_type(ct)?;
    }

    let conn = state.pool.get()?;
    let groups = queries::get_channel_groups(&conn, playlist_id, content_type.as_deref())?;
    debug!("get_channel_groups playlist_id={} type={:?} -> {} groups", playlist_id, content_type, groups.len());
    Ok(groups)
}

#[tauri::command]
pub async fn toggle_favorite(state: State<'_, AppState>, channel_id: i64) -> Result<(), AppError> {
    channel_domain::validate_channel_id(channel_id)?;

    let conn = state.pool.get()?;
    mutations::toggle_favorite(&conn, channel_id)?;
    debug!("toggle_favorite channel_id={}", channel_id);
    Ok(())
}

#[tauri::command]
pub async fn get_favorites(state: State<'_, AppState>) -> Result<Vec<Channel>, AppError> {
    let conn = state.pool.get()?;
    let channels = queries::get_favorites(&conn)?;
    debug!("get_favorites -> {} channels", channels.len());
    Ok(channels)
}

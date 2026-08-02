use crate::db::{queries, mutations, models::Channel};
use crate::error::AppError;
use crate::playback;
use crate::state::AppState;
use log::{info, warn};
use tauri::State;

#[tauri::command]
pub async fn check_mpv_installed() -> Result<bool, AppError> {
    Ok(playback::check_mpv_installed())
}

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
        if let Err(e) =
            mutations::upsert_watch_progress(&conn, channel_id, &channel.content_type, None, None, None, None, None)
        {
            warn!("Failed to record watch progress: {}", e);
        }
    }

    info!("Playing channel: {} ({})", channel.name, channel.content_type);

    Ok(())
}

#[tauri::command]
pub async fn stop_playback(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut player = state.mpv_player.lock().await;
    playback::stop(&mut player, &state.current_channel).await?;

    info!("Playback stopped");

    Ok(())
}

#[tauri::command]
pub async fn is_playing(state: State<'_, AppState>) -> Result<bool, AppError> {
    let mut player = state.mpv_player.lock().await;
    Ok(playback::is_playing(&mut player))
}

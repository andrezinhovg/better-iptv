use crate::channel_domain;
use crate::db::mutations;
use crate::error::AppError;
use crate::playlist::{fetch_series_info, SeriesInfo, XtreamCredentials};
use crate::series_domain::{self, PlaylistEpisode};
use crate::state::AppState;
use log::{info, warn};
use tauri::State;

fn get_language_settings(
    db: &rusqlite::Connection,
) -> Result<(Option<String>, Option<String>), AppError> {
    let settings =
        crate::db::queries::get_multiple_settings(db, &["audio_language", "subtitle_language"])?;

    let audio = settings
        .get("audio_language")
        .filter(|s| !s.is_empty())
        .cloned();
    let subtitle = settings
        .get("subtitle_language")
        .filter(|s| !s.is_empty())
        .cloned();

    Ok((audio, subtitle))
}

#[tauri::command]
pub async fn get_series_info(
    server_url: String,
    username: String,
    password: String,
    series_id: i64,
) -> Result<SeriesInfo, AppError> {
    series_domain::validate_server_url(&server_url)?;
    series_domain::validate_credentials(&username, &password)?;

    let creds = XtreamCredentials {
        server_url,
        username,
        password,
    };

    fetch_series_info(&creds, series_id)
        .await
        .map_err(|e| AppError::Http(e.to_string()))
}

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
        if let Err(e) = mutations::upsert_watch_progress(
            &conn,
            channel_id,
            "series",
            Some(&first_episode.id),
            Some(&first_episode.extension),
            Some(season_number),
            Some(episode_num),
            Some(first_title),
        ) {
            warn!("Failed to record watch progress: {}", e);
        }
    }

    info!("Playing series episode: {}", first_title);

    Ok(())
}

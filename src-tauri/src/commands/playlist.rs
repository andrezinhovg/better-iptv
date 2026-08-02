use crate::db::{models::*, queries, mutations};
use crate::error::AppError;
use crate::playlist::{fetch_xtream_channels_with_progress, parse_m3u, get_xtream_epg_url, XtreamCredentials};
use crate::playlist_domain;
use crate::state::AppState;
use log::{debug, error, info};
use tauri::{AppHandle, Emitter, State};

fn get_playlist_user_agent(db: &rusqlite::Connection) -> Result<String, AppError> {
    let settings = queries::get_multiple_settings(
        db,
        &["playlist_user_agent_mode", "playlist_user_agent_custom"],
    )?;

    let mode = settings.get("playlist_user_agent_mode").map(|s| s.as_str());
    let custom = settings.get("playlist_user_agent_custom").map(|s| s.as_str());

    Ok(crate::http::resolve_playlist_user_agent(mode, custom))
}

#[tauri::command]
pub async fn import_playlist(
    state: State<'_, AppState>,
    name: String,
    source: String,
) -> Result<Playlist, AppError> {
    playlist_domain::validate_playlist_name(&name)?;
    playlist_domain::validate_playlist_source(&source)?;

    info!("M3U import started: {}", crate::utils::mask_credentials(&source));

    let playlist_user_agent = {
        let conn = state.pool.get()?;
        get_playlist_user_agent(&conn)?
    };

    let channels = parse_m3u(&source, Some(&playlist_user_agent))
        .await
        .map_err(|e| AppError::Parse(e.to_string()))?;

    let playlist = playlist_domain::build_m3u_playlist(name, source)?;
    let pool = state.pool.clone();

    // Playlist creation + batch inserts are synchronous rusqlite calls; run
    // them on a blocking thread so a large import doesn't hold up the async
    // runtime worker that also serves concurrent IPC commands (EPG polling,
    // favorite toggles, etc).
    let (playlist_id, mut result) = tauri::async_runtime::spawn_blocking(
        move || -> Result<(i64, Playlist), AppError> {
            let conn = pool.get()?;
            let playlist_id = mutations::create_playlist(&conn, &playlist)?;

            let channels_with_playlist =
                playlist_domain::assign_playlist_id_to_channels(channels, playlist_id);
            let batches = playlist_domain::batch_channels(
                channels_with_playlist,
                playlist_domain::DEFAULT_BATCH_SIZE,
            );
            for batch in batches {
                mutations::create_channels_batch(&conn, &batch)?;
            }

            Ok((playlist_id, playlist))
        },
    )
    .await
    .map_err(|e| AppError::Database(format!("background task failed: {}", e)))??;

    result.id = Some(playlist_id);
    Ok(result)
}

#[tauri::command]
pub async fn import_xtream_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    server_url: String,
    username: String,
    password: String,
) -> Result<Playlist, AppError> {
    playlist_domain::validate_playlist_name(&name)?;
    playlist_domain::validate_xtream_credentials(&server_url, &username)?;

    info!(
        "Xtream import started: server={}, username={}",
        server_url, username
    );

    let creds = XtreamCredentials {
        server_url: server_url.clone(),
        username: username.clone(),
        password: password.clone(),
    };

    let playlist_user_agent = {
        let conn = state.pool.get()?;
        get_playlist_user_agent(&conn)?
    };

    debug!("Fetching channels from Xtream API: {}", server_url);
    let channels = fetch_xtream_channels_with_progress(
        &creds,
        Some(&playlist_user_agent),
        |progress| {
            let _ = app.emit("import-progress", progress);
        },
    )
    .await
    .map_err(|e| {
        let err_msg = format!("Failed to fetch Xtream channels: {}", e);
        error!("{}", err_msg);
        AppError::Http(err_msg)
    })?;

    info!("Fetched {} channels from Xtream API", channels.len());

    let playlist = playlist_domain::build_xtream_playlist(
        name,
        server_url,
        username,
        password,
    )?;
    let pool = state.pool.clone();

    // Playlist creation, batch inserts, and the EPG-url settings write are
    // all synchronous rusqlite calls; run them on a blocking thread so a
    // large Xtream catalog (tens of thousands of channels) doesn't hold up
    // the async runtime worker that also serves concurrent IPC commands.
    let (playlist_id, mut result) = tauri::async_runtime::spawn_blocking(
        move || -> Result<(i64, Playlist), AppError> {
            let conn = pool.get()?;

            let playlist_id = mutations::create_playlist(&conn, &playlist).map_err(|e| {
                error!("Failed to create playlist: {}", e);
                e
            })?;

            debug!("Created playlist with ID: {}", playlist_id);

            let channels_with_playlist =
                playlist_domain::assign_playlist_id_to_channels(channels, playlist_id);

            let total_channels = channels_with_playlist.len();
            debug!(
                "Inserting {} channels in batches of {}...",
                total_channels, playlist_domain::DEFAULT_BATCH_SIZE
            );

            let batches = playlist_domain::batch_channels(
                channels_with_playlist,
                playlist_domain::DEFAULT_BATCH_SIZE,
            );
            for (batch_num, batch) in batches.iter().enumerate() {
                mutations::create_channels_batch(&conn, batch).map_err(|e| {
                    error!("Failed to insert channel batch: {}", e);
                    e
                })?;
                debug!("Inserted batch {}/{}", batch_num + 1, batches.len());
            }

            info!(
                "Xtream import completed: {} channels imported",
                total_channels
            );

            let existing_epg_url = queries::get_setting(&conn, "epg_url")?;
            let has_epg_url = existing_epg_url
                .as_ref()
                .map(|u| !u.trim().is_empty())
                .unwrap_or(false);

            if !has_epg_url {
                let epg_url = get_xtream_epg_url(&creds);
                mutations::set_setting(&conn, "epg_url", &epg_url)?;
                info!(
                    "Auto-populated EPG URL from Xtream provider: {}",
                    crate::utils::mask_credentials(&epg_url)
                );
            } else {
                debug!("EPG URL already configured, skipping auto-population");
            }

            Ok((playlist_id, playlist))
        },
    )
    .await
    .map_err(|e| AppError::Database(format!("background task failed: {}", e)))??;

    result.id = Some(playlist_id);
    Ok(result)
}

#[tauri::command]
pub async fn refresh_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<MergeResult, AppError> {
    // Get playlist info and user agent — then connection is returned to pool
    let (playlist, is_xtream, playlist_user_agent) = {
        let conn = state.pool.get()?;
        let playlist = queries::get_playlist_by_id(&conn, playlist_id)?
            .ok_or(AppError::PlaylistNotFound(playlist_id))?;
        let is_xtream = playlist.xtream_username.is_some();
        let ua = get_playlist_user_agent(&conn)?;
        (playlist, is_xtream, ua)
    };

    // Fetch fresh channels (async, no connection held)
    let fresh_channels = if is_xtream {
        let creds = XtreamCredentials {
            server_url: playlist.url.clone().unwrap_or_default(),
            username: playlist.xtream_username.clone().unwrap_or_default(),
            password: playlist.xtream_password.clone().unwrap_or_default(),
        };

        info!("Refreshing Xtream playlist '{}' (ID {})", playlist.name, playlist_id);
        fetch_xtream_channels_with_progress(&creds, Some(&playlist_user_agent), |progress| {
            let _ = app.emit("refresh-progress", progress);
        })
        .await
        .map_err(|e| {
            error!("Failed to fetch Xtream channels for refresh: {}", e);
            AppError::Http(e.to_string())
        })?
    } else {
        let source = playlist.url.as_deref().or(playlist.file_path.as_deref())
            .ok_or_else(|| AppError::InvalidInput("Playlist has no URL or file path".to_string()))?;

        info!("Refreshing M3U playlist '{}' (ID {})", playlist.name, playlist_id);
        parse_m3u(source, Some(&playlist_user_agent))
            .await
            .map_err(|e| {
                error!("Failed to parse M3U for refresh: {}", e);
                AppError::Parse(e.to_string())
            })?
    };

    let pool = state.pool.clone();
    let playlist_name = playlist.name.clone();

    // merge_channels/update_playlist_last_updated are synchronous rusqlite
    // calls; run on a blocking thread so a large refresh doesn't hold up the
    // async runtime worker that also serves concurrent IPC commands.
    let result = tauri::async_runtime::spawn_blocking(
        move || -> Result<MergeResult, AppError> {
            let conn = pool.get()?;
            let result = mutations::merge_channels(&conn, playlist_id, &fresh_channels, is_xtream)?;
            mutations::update_playlist_last_updated(&conn, playlist_id)?;
            Ok(result)
        },
    )
    .await
    .map_err(|e| AppError::Database(format!("background task failed: {}", e)))??;

    info!(
        "Playlist '{}' refreshed: {} added, {} updated, {} removed ({} total)",
        playlist_name, result.added, result.updated, result.removed, result.total
    );

    Ok(result)
}

#[tauri::command]
pub async fn get_stale_playlist_ids(
    state: State<'_, AppState>,
) -> Result<Vec<i64>, AppError> {
    let conn = state.pool.get()?;
    let stale = queries::get_stale_playlists(&conn, 7)?;
    Ok(stale.iter().filter_map(|p| p.id).collect())
}

#[tauri::command]
pub async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, AppError> {
    let conn = state.pool.get()?;
    Ok(queries::get_playlists(&conn)?)
}

#[tauri::command]
pub async fn delete_playlist(state: State<'_, AppState>, id: i64) -> Result<(), AppError> {
    let conn = state.pool.get()?;
    Ok(mutations::delete_playlist(&conn, id)?)
}

#[tauri::command]
pub async fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    new_name: String,
) -> Result<(), AppError> {
    playlist_domain::validate_playlist_name(&new_name)?;

    let conn = state.pool.get()?;
    mutations::rename_playlist(&conn, playlist_id, &new_name)?;

    info!("Playlist ID {} renamed to: {}", playlist_id, new_name);

    Ok(())
}

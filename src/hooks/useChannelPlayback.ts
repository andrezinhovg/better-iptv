import { useCallback, useEffect } from 'react';
import { usePlayerStore } from '../stores/player-store';
import {
  playChannel as tauriPlayChannel,
  stopPlayback as tauriStopPlayback,
  isPlaying as checkIsPlaying,
  getChannelEpg,
  playEpisodeWithSeason,
} from '../lib/tauri';
import { logger } from '../lib/logger';
import type { Channel, Playlist } from '../types';

/**
 * Episode data for playlist playback
 */
export interface PlaylistEpisode {
  id: string;
  title: string;
  extension: string;
}

/**
 * Hook result for channel playback
 */
interface UseChannelPlaybackResult {
  /** Currently playing channel */
  currentChannel: Channel | null;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Current EPG program title */
  currentProgram: string | null;
  /** Next EPG program title */
  nextProgram: string | null;
  /** Play a channel (opens series view for series content, when the playlist has Xtream credentials) */
  play: (channel: Channel, playlist?: Playlist) => Promise<{ type: 'series'; channel: Channel } | void>;
  /** Stop current playback */
  stop: () => Promise<void>;
  /** Play episode(s) from a series */
  playEpisode: (
    channelId: number,
    episodeId: string,
    extension: string,
    title: string,
    seasonNumber: number,
    episodeNum: number,
    playlist: Playlist,
    remainingEpisodes?: PlaylistEpisode[]
  ) => Promise<void>;
}

/**
 * Custom hook for channel playback management
 *
 * Consolidates:
 * - Play/stop channel logic
 * - MPV status polling
 * - EPG updates during playback
 * - Episode/series playback
 */
export function useChannelPlayback(): UseChannelPlaybackResult {
  const currentChannel = usePlayerStore((s) => s.currentChannel);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentProgram = usePlayerStore((s) => s.currentProgram);
  const nextProgram = usePlayerStore((s) => s.nextProgram);
  const setCurrentChannel = usePlayerStore((s) => s.setCurrentChannel);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setCurrentProgram = usePlayerStore((s) => s.setCurrentProgram);
  const setNextProgram = usePlayerStore((s) => s.setNextProgram);
  const loadContinueWatching = usePlayerStore((s) => s.loadContinueWatching);

  // Poll MPV playback status to detect when player is closed externally
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(async () => {
      try {
        const playing = await checkIsPlaying();
        if (!playing) {
          // MPV was closed externally, update UI
          setIsPlaying(false);
          setCurrentChannel(null);
          setCurrentProgram(null);
          setNextProgram(null);
        }
      } catch (err) {
        logger.error('Failed to check playback status:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isPlaying, setIsPlaying, setCurrentChannel, setCurrentProgram, setNextProgram]);

  // Update EPG periodically while playing
  useEffect(() => {
    if (!isPlaying || !currentChannel?.epg_id) return;

    const interval = setInterval(async () => {
      try {
        const [current, next] = await getChannelEpg(currentChannel.epg_id!);
        setCurrentProgram(current);
        setNextProgram(next);
      } catch (err) {
        logger.error('Failed to update EPG:', err);
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isPlaying, currentChannel, setCurrentProgram, setNextProgram]);

  // Play a channel
  const play = useCallback(
    async (
      channel: Channel,
      playlist?: Playlist
    ): Promise<{ type: 'series'; channel: Channel } | void> => {
      // Series browsing (seasons/episodes) is an Xtream Codes API feature —
      // M3U playlists have no such structure, so without Xtream credentials
      // there's no series page to open. Fall through and play the entry
      // directly instead of silently doing nothing.
      if (channel.content_type === 'series' && playlist?.xtream_username && playlist?.xtream_password) {
        return { type: 'series', channel };
      }

      try {
        // Toggle playback if same channel
        if (currentChannel?.id === channel.id && isPlaying) {
          await tauriStopPlayback();
          setIsPlaying(false);
          setCurrentProgram(null);
          setNextProgram(null);
          return;
        }

        // Play new channel
        await tauriPlayChannel(channel);
        setCurrentChannel(channel);
        setIsPlaying(true);
        loadContinueWatching(channel.playlist_id);

        // Fetch EPG data if channel has EPG ID
        if (channel.epg_id) {
          try {
            const [current, next] = await getChannelEpg(channel.epg_id);
            setCurrentProgram(current);
            setNextProgram(next);
          } catch (err) {
            logger.error('Failed to fetch EPG:', err);
            setCurrentProgram(null);
            setNextProgram(null);
          }
        } else {
          setCurrentProgram(null);
          setNextProgram(null);
        }
      } catch (err) {
        logger.error('Failed to play channel:', err);
        throw err;
      }
    },
    [
      currentChannel,
      isPlaying,
      setCurrentChannel,
      setIsPlaying,
      setCurrentProgram,
      setNextProgram,
      loadContinueWatching,
    ]
  );

  // Stop playback
  const stop = useCallback(async () => {
    try {
      await tauriStopPlayback();
      setIsPlaying(false);
      setCurrentProgram(null);
      setNextProgram(null);
    } catch (err) {
      logger.error('Failed to stop playback:', err);
      throw err;
    }
  }, [setIsPlaying, setCurrentProgram, setNextProgram]);

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

  return {
    currentChannel,
    isPlaying,
    currentProgram,
    nextProgram,
    play,
    stop,
    playEpisode,
  };
}

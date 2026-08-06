import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/player-store';
import { getSeriesInfo, getWatchProgress } from '../lib/tauri';
import { getRemainingEpisodes, getNextEpisode, getFirstEpisode } from '../lib/episodeQueue';
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
  ) => Promise<void>;
}

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

  // Wraps onPlayEpisode so the resume banner reflects whatever was just
  // played, instead of the progress fetched on mount.
  const playEpisodeAndRefresh = useCallback(
    async (
      episodeId: string,
      extension: string,
      title: string,
      seasonNumber: number,
      episodeNum: number,
      remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
    ) => {
      await onPlayEpisode(episodeId, extension, title, seasonNumber, episodeNum, remainingEpisodes);
      try {
        const refreshedProgress = await getWatchProgress(channelId);
        setWatchProgress(refreshedProgress);
      } catch (err) {
        logger.error('Failed to refresh watch progress:', err);
      }
    },
    [onPlayEpisode, channelId]
  );

  const handleContinue = useCallback(() => {
    if (!watchProgress?.episode_id || !currentSeries) return;

    const next = getNextEpisode(
      currentSeries.episodes,
      currentSeries.seasons,
      watchProgress.season_number ?? 1,
      watchProgress.episode_id
    );
    if (!next) return;

    playEpisodeAndRefresh(
      next.episode.id,
      next.episode.container_extension,
      next.episode.title,
      next.seasonNumber,
      next.episode.episode_num,
      next.queue
    );
  }, [watchProgress, currentSeries, playEpisodeAndRefresh]);

  const handleRestart = useCallback(() => {
    if (!currentSeries) return;

    const first = getFirstEpisode(currentSeries.episodes, currentSeries.seasons);
    if (!first) return;

    playEpisodeAndRefresh(
      first.episode.id,
      first.episode.container_extension,
      first.episode.title,
      first.seasonNumber,
      first.episode.episode_num,
      first.queue
    );
  }, [currentSeries, playEpisodeAndRefresh]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
            <p className="text-fluid-base font-medium text-text-muted">Loading series...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !currentSeries) {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="mb-4 text-fluid-base font-medium text-red-600 dark:text-red-400">
              {error || 'Failed to load series'}
            </p>
            <button
              onClick={onBack}
              className="rounded-lg bg-accent px-5 py-2.5 text-white hover:bg-accent-hover"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedSeasonEpisodes = selectedSeason ? currentSeries.episodes[selectedSeason] || [] : [];

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        <div className="mx-auto max-w-7xl">
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-fluid-sm text-accent hover:text-accent-hover"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Series List
          </button>
          <div className="flex gap-8">
            {currentSeries.info.cover && (
              <img
                src={currentSeries.info.cover}
                alt={currentSeries.info.name}
                loading="lazy"
                className="h-72 w-48 rounded-xl object-cover shadow-lg"
              />
            )}
            <div className="flex-1">
              <h1 className="mb-3 text-fluid-3xl font-bold text-text">
                {currentSeries.info.name}
              </h1>
              {currentSeries.info.genre && (
                <p className="mb-3 text-fluid-sm text-text-muted">
                  {currentSeries.info.genre}
                </p>
              )}
              {currentSeries.info.plot && (
                <p className="line-clamp-3 text-fluid-base text-text-muted">
                  {currentSeries.info.plot}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume banner */}
      {watchProgress?.episode_id && (
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
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex gap-3 overflow-x-auto py-5">
            {currentSeries.seasons.map((season) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeason(season.season_number)}
                className={`whitespace-nowrap rounded-lg px-5 py-2.5 text-fluid-sm font-medium transition-colors ${
                  selectedSeason === season.season_number
                    ? 'bg-accent text-white'
                    : 'bg-surface-hover text-text hover:bg-border'
                }`}
              >
                {season.name} ({season.episode_count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Episode List */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          {selectedSeasonEpisodes.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fluid-base text-text-muted">
                No episodes available for this season
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {selectedSeasonEpisodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  isLastWatched={episode.id === watchProgress?.episode_id}
                  onPlay={() =>
                    // Remaining-episodes queue is only needed when the user
                    // actually presses play, not on every render of every card.
                    // Use selectedSeason (not episode.season) as the season
                    // number: it's the same key used to index
                    // currentSeries.episodes[...] for resuming later, so it
                    // must match even if the provider numbers episode.season
                    // inconsistently (e.g. specials as season 0).
                    selectedSeason != null &&
                    playEpisodeAndRefresh(
                      episode.id,
                      episode.container_extension,
                      episode.title,
                      Number(selectedSeason),
                      episode.episode_num,
                      getRemainingEpisodes(selectedSeasonEpisodes, episode.id)
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EpisodeCardProps {
  episode: Episode;
  onPlay: () => void;
  isLastWatched?: boolean;
}

function EpisodeCard({ episode, onPlay, isLastWatched }: EpisodeCardProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow hover:shadow-lg ${
        isLastWatched ? 'border-accent ring-2 ring-accent' : 'border-border'
      }`}
    >
      <div className="relative bg-bg">
        {isLastWatched && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-accent px-2 py-0.5 text-fluid-xs font-medium text-white shadow">
            Continuar assistindo
          </span>
        )}
        {episode.info.movie_image ? (
          <img
            src={episode.info.movie_image}
            alt={episode.title}
            loading="lazy"
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-gradient-to-br from-accent to-purple-600">
            <span className="text-fluid-2xl font-bold text-white">E{episode.episode_num}</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="mb-1 line-clamp-2 text-fluid-base font-medium text-text">
          Episode {episode.episode_num}
        </h3>
        <p className="mb-2 line-clamp-1 text-fluid-sm text-text-muted">
          {episode.title}
        </p>
        {episode.info.plot && (
          <p className="mb-3 line-clamp-2 text-fluid-xs text-text-muted">
            {episode.info.plot}
          </p>
        )}
        <button
          onClick={onPlay}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-fluid-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Play className="h-4 w-4" />
          {isLastWatched ? 'Continuar' : 'Play'}
        </button>
      </div>
    </div>
  );
}

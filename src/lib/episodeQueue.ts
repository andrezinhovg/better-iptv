import type { Episode, Season } from '../types';
import type { PlaylistEpisode } from './tauri';

/**
 * Builds the episode playback queue starting at `fromEpisodeId`: slices the
 * season's episode list from that episode onward, sorted by episode_num.
 * Returns an empty list if the episode isn't found in `seasonEpisodes`.
 */
export function getRemainingEpisodes(
  seasonEpisodes: Episode[],
  fromEpisodeId: string
): PlaylistEpisode[] {
  const fromEpisode = seasonEpisodes.find((ep) => ep.id === fromEpisodeId);
  if (!fromEpisode) return [];

  return seasonEpisodes
    .filter((ep) => ep.episode_num >= fromEpisode.episode_num)
    .sort((a, b) => a.episode_num - b.episode_num)
    .map((ep) => ({ id: ep.id, title: ep.title, extension: ep.container_extension }));
}

export interface NextEpisode {
  episode: Episode;
  seasonNumber: number;
  queue: PlaylistEpisode[];
}

const sortByEpisodeNum = (episodes: Episode[]) =>
  [...episodes].sort((a, b) => a.episode_num - b.episode_num);

/**
 * Resolves what "Continue" should play: the episode right after
 * `lastWatchedEpisodeId` in its season, or the first episode of the next
 * season if that was the season finale. Falls back to replaying the last
 * watched episode when there's nothing left to advance to (series finale, or
 * the episode/season is no longer in the catalog). Returns null only when
 * the last watched episode can't be located at all.
 */
export function getNextEpisode(
  episodesBySeasonKey: Record<string, Episode[]>,
  seasons: Season[],
  lastWatchedSeasonNumber: number,
  lastWatchedEpisodeId: string
): NextEpisode | null {
  const currentSeasonEpisodes = sortByEpisodeNum(
    episodesBySeasonKey[String(lastWatchedSeasonNumber)] ?? []
  );
  const lastIndex = currentSeasonEpisodes.findIndex((ep) => ep.id === lastWatchedEpisodeId);
  if (lastIndex === -1) return null;

  const nextInSeason = currentSeasonEpisodes[lastIndex + 1];
  if (nextInSeason) {
    return {
      episode: nextInSeason,
      seasonNumber: lastWatchedSeasonNumber,
      queue: getRemainingEpisodes(currentSeasonEpisodes, nextInSeason.id),
    };
  }

  const orderedSeasons = [...seasons].sort(
    (a, b) => Number(a.season_number) - Number(b.season_number)
  );
  const currentSeasonIdx = orderedSeasons.findIndex(
    (s) => Number(s.season_number) === lastWatchedSeasonNumber
  );
  const nextSeason = currentSeasonIdx >= 0 ? orderedSeasons[currentSeasonIdx + 1] : undefined;
  if (nextSeason) {
    const nextSeasonEpisodes = sortByEpisodeNum(
      episodesBySeasonKey[nextSeason.season_number] ?? []
    );
    const firstEpisode = nextSeasonEpisodes[0];
    if (firstEpisode) {
      return {
        episode: firstEpisode,
        seasonNumber: Number(nextSeason.season_number),
        queue: getRemainingEpisodes(nextSeasonEpisodes, firstEpisode.id),
      };
    }
  }

  // Series finale already watched (or nothing to advance to) — replay it.
  const lastEpisode = currentSeasonEpisodes[lastIndex];
  return {
    episode: lastEpisode,
    seasonNumber: lastWatchedSeasonNumber,
    queue: getRemainingEpisodes(currentSeasonEpisodes, lastEpisode.id),
  };
}

/**
 * Resolves what "Start Over" should play: the first episode of the earliest
 * season that actually has episodes. Doesn't trust `seasons[0]` — the array
 * isn't guaranteed sorted, and a leading "Specials"/season-0 entry with no
 * episodes would otherwise make this silently resolve to nothing.
 */
export function getFirstEpisode(
  episodesBySeasonKey: Record<string, Episode[]>,
  seasons: Season[]
): NextEpisode | null {
  const orderedSeasons = [...seasons].sort(
    (a, b) => Number(a.season_number) - Number(b.season_number)
  );

  for (const season of orderedSeasons) {
    const episodes = sortByEpisodeNum(episodesBySeasonKey[season.season_number] ?? []);
    const firstEpisode = episodes[0];
    if (firstEpisode) {
      return {
        episode: firstEpisode,
        seasonNumber: Number(season.season_number),
        queue: getRemainingEpisodes(episodes, firstEpisode.id),
      };
    }
  }

  return null;
}

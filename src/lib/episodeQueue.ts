import type { Episode } from '../types';
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

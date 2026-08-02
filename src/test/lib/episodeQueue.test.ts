import { describe, it, expect } from 'vitest';
import { getRemainingEpisodes } from '../../lib/episodeQueue';
import type { Episode } from '../../types';

const makeEpisode = (overrides: Partial<Episode>): Episode => ({
  id: '1',
  episode_num: 1,
  title: 'Episode',
  container_extension: 'mp4',
  season: 1,
  info: {},
  ...overrides,
});

describe('getRemainingEpisodes', () => {
  it('returns episodes from the given id onward, sorted by episode_num', () => {
    const episodes = [
      makeEpisode({ id: 'e1', episode_num: 1 }),
      makeEpisode({ id: 'e2', episode_num: 2 }),
      makeEpisode({ id: 'e3', episode_num: 3 }),
    ];

    const result = getRemainingEpisodes(episodes, 'e2');

    expect(result.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('maps to the PlaylistEpisode shape (id, title, extension)', () => {
    const episodes = [
      makeEpisode({ id: 'e1', title: 'Pilot', container_extension: 'mkv' }),
    ];

    const result = getRemainingEpisodes(episodes, 'e1');

    expect(result).toEqual([{ id: 'e1', title: 'Pilot', extension: 'mkv' }]);
  });

  it('returns an empty list when the episode id is not found', () => {
    const episodes = [makeEpisode({ id: 'e1' })];

    const result = getRemainingEpisodes(episodes, 'missing');

    expect(result).toEqual([]);
  });

  it('sorts out-of-order input by episode_num', () => {
    const episodes = [
      makeEpisode({ id: 'e3', episode_num: 3 }),
      makeEpisode({ id: 'e1', episode_num: 1 }),
      makeEpisode({ id: 'e2', episode_num: 2 }),
    ];

    const result = getRemainingEpisodes(episodes, 'e1');

    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});

import { describe, it, expect } from 'vitest';
import { getRemainingEpisodes, getNextEpisode, getFirstEpisode } from '../../lib/episodeQueue';
import type { Episode, Season } from '../../types';

const makeEpisode = (overrides: Partial<Episode>): Episode => ({
  id: '1',
  episode_num: 1,
  title: 'Episode',
  container_extension: 'mp4',
  season: 1,
  info: {},
  ...overrides,
});

const makeSeason = (overrides: Partial<Season>): Season => ({
  id: '1',
  name: 'Season',
  season_number: '1',
  episode_count: 1,
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

describe('getNextEpisode', () => {
  const seasons = [makeSeason({ season_number: '1' }), makeSeason({ season_number: '2' })];

  it('returns the following episode within the same season', () => {
    const episodesBySeasonKey = {
      '1': [
        makeEpisode({ id: 'e1', episode_num: 1 }),
        makeEpisode({ id: 'e2', episode_num: 2 }),
      ],
    };

    const result = getNextEpisode(episodesBySeasonKey, seasons, 1, 'e1');

    expect(result?.episode.id).toBe('e2');
    expect(result?.seasonNumber).toBe(1);
    expect(result?.queue.map((e) => e.id)).toEqual(['e2']);
  });

  it('advances to the first episode of the next season after a season finale', () => {
    const episodesBySeasonKey = {
      '1': [makeEpisode({ id: 's1e1', episode_num: 1 })],
      '2': [
        makeEpisode({ id: 's2e1', episode_num: 1 }),
        makeEpisode({ id: 's2e2', episode_num: 2 }),
      ],
    };

    const result = getNextEpisode(episodesBySeasonKey, seasons, 1, 's1e1');

    expect(result?.episode.id).toBe('s2e1');
    expect(result?.seasonNumber).toBe(2);
    expect(result?.queue.map((e) => e.id)).toEqual(['s2e1', 's2e2']);
  });

  it('replays the last episode when the series finale was already watched', () => {
    const episodesBySeasonKey = {
      '2': [makeEpisode({ id: 's2e1', episode_num: 1 })],
    };

    const result = getNextEpisode(episodesBySeasonKey, seasons, 2, 's2e1');

    expect(result?.episode.id).toBe('s2e1');
    expect(result?.seasonNumber).toBe(2);
  });

  it('returns null when the last watched episode is not found', () => {
    const episodesBySeasonKey = { '1': [makeEpisode({ id: 'e1' })] };

    const result = getNextEpisode(episodesBySeasonKey, seasons, 1, 'missing');

    expect(result).toBeNull();
  });
});

describe('getFirstEpisode', () => {
  it('returns the first episode of the lowest-numbered season', () => {
    const seasons = [makeSeason({ season_number: '2' }), makeSeason({ season_number: '1' })];
    const episodesBySeasonKey = {
      '1': [
        makeEpisode({ id: 's1e2', episode_num: 2 }),
        makeEpisode({ id: 's1e1', episode_num: 1 }),
      ],
      '2': [makeEpisode({ id: 's2e1', episode_num: 1 })],
    };

    const result = getFirstEpisode(episodesBySeasonKey, seasons);

    expect(result?.episode.id).toBe('s1e1');
    expect(result?.seasonNumber).toBe(1);
    expect(result?.queue.map((e) => e.id)).toEqual(['s1e1', 's1e2']);
  });

  it('skips a leading season with no episodes (e.g. an empty Specials entry)', () => {
    const seasons = [makeSeason({ season_number: '0' }), makeSeason({ season_number: '1' })];
    const episodesBySeasonKey = {
      '0': [],
      '1': [makeEpisode({ id: 's1e1', episode_num: 1 })],
    };

    const result = getFirstEpisode(episodesBySeasonKey, seasons);

    expect(result?.episode.id).toBe('s1e1');
    expect(result?.seasonNumber).toBe(1);
  });

  it('returns null when no season has any episodes', () => {
    const seasons = [makeSeason({ season_number: '1' })];

    const result = getFirstEpisode({}, seasons);

    expect(result).toBeNull();
  });
});

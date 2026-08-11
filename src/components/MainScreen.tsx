import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePlayerStore } from '../stores/player-store';
import { getChannelGroups, getStalePlaylistIds, getChannels } from '../lib/tauri';
import { CategorySidebar } from './CategorySidebar';
import { ChannelCard } from './ChannelCard';
import { SearchBar } from './SearchBar';
import { ContentTypeTabs } from './ContentTypeTabs';
import { ContinueWatchingRow } from './ContinueWatchingRow';
import { NowPlayingBar } from './NowPlayingBar';
import { Settings as SettingsIcon } from 'lucide-react';
import SeriesView from './SeriesView';
import SettingsModal from './Settings';
import PinEntryModal from './modals/PinEntryModal';
import ConfirmationModal from './modals/ConfirmationModal';
import RefreshModal from './modals/RefreshModal';
import type { Channel } from '../types';
import { logger } from '../lib/logger';
import { useResponsiveGrid } from '../hooks/useResponsiveGrid';
import { useEpgData } from '../hooks/useEpgData';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useChannelPlayback } from '../hooks/useChannelPlayback';
import { shouldBlockChannel } from '../lib/parentalControls';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useChannelFilter } from '../hooks/useChannelFilter';
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';

export default function MainScreen() {
  // Channel data
  const channels = usePlayerStore((s) => s.channels);

  // Search & filters
  const searchQuery = usePlayerStore((s) => s.searchQuery);
  const contentTypeFilter = usePlayerStore((s) => s.contentTypeFilter);
  const setSearchQuery = usePlayerStore((s) => s.setSearchQuery);
  const setContentTypeFilter = usePlayerStore((s) => s.setContentTypeFilter);
  const setCategories = usePlayerStore((s) => s.setCategories);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Consolidated channel filtering (content type, category, parental, search)
  const filteredChannels = useChannelFilter(debouncedSearchQuery);

  // Playback (hook handles polling + EPG updates)
  const {
    currentChannel,
    isPlaying,
    currentProgram,
    nextProgram,
    play: playChannelAction,
    stop: stopPlaybackAction,
    playEpisode: playEpisodeAction,
  } = useChannelPlayback();
  const currentPlaylist = usePlayerStore((s) => s.currentPlaylist);
  const setChannels = usePlayerStore((s) => s.setChannels);
  const toggleChannelFavorite = usePlayerStore((s) => s.toggleChannelFavorite);
  const continueWatching = usePlayerStore((s) => s.continueWatching);
  const loadContinueWatching = usePlayerStore((s) => s.loadContinueWatching);

  // Parental
  const parentalEnabled = usePlayerStore((s) => s.parentalEnabled);
  const parentalUnlocked = usePlayerStore((s) => s.parentalUnlocked);
  const blockedChannelIds = usePlayerStore((s) => s.blockedChannelIds);
  const blockedCategories = usePlayerStore((s) => s.blockedCategories);
  const parentalAutoDetect = usePlayerStore((s) => s.parentalAutoDetect);
  const parentalVisibility = usePlayerStore((s) => s.parentalVisibility);
  const loadParentalSettings = usePlayerStore((s) => s.loadParentalSettings);

  // Use consolidated EPG hook for channel EPG data (with debouncing and caching)
  const { channelEpgData } = useEpgData(filteredChannels);

  const [selectedSeries, setSelectedSeries] = useState<Channel | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<Channel | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<globalThis.HTMLInputElement>(null);
  const [showStalePrompt, setShowStalePrompt] = useState(false);
  const [stalePlaylistId, setStalePlaylistId] = useState<number | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);

  // Global keyboard shortcuts (Space=play/stop, /=focus search, Escape=stop)
  useKeyboardShortcuts(searchInputRef);

  // Column count derived from the real measured width of #channel-list
  // (see useResponsiveGrid) — row height is intrinsic per-card (aspect-ratio
  // in ChannelCard) and measured dynamically by the row virtualizer below,
  // so nothing here needs a JS-guessed pixel height. Poster mode
  // (Movies/Series tabs) only changes how ChannelCard renders the artwork
  // aspect ratio — see posterMode there.
  const isPosterTab = contentTypeFilter === 'vod' || contentTypeFilter === 'series';
  const { columns } = useResponsiveGrid(parentRef);

  // Load parental settings on mount
  useEffect(() => {
    loadParentalSettings();
  }, [loadParentalSettings]);

  // Check for stale playlists on mount
  useEffect(() => {
    if (!currentPlaylist?.id) return;

    getStalePlaylistIds()
      .then((ids) => {
        if (ids.includes(currentPlaylist.id!)) {
          setStalePlaylistId(currentPlaylist.id!);
          setShowStalePrompt(true);
        }
      })
      .catch((err) => logger.error('Failed to check stale playlists:', err));
  }, [currentPlaylist?.id]);

  // Load continue-watching entries for the active playlist
  useEffect(() => {
    if (!currentPlaylist?.id) return;
    loadContinueWatching(currentPlaylist.id);
  }, [currentPlaylist?.id, loadContinueWatching]);

  // Fetch categories when playlist or content type changes
  useEffect(() => {
    if (!currentPlaylist?.id) {
      setCategories([]);
      return;
    }

    if (contentTypeFilter === 'favorites') {
      setCategories([]);
      return;
    }

    const contentType = contentTypeFilter === 'all' ? undefined : contentTypeFilter;
    getChannelGroups(currentPlaylist.id, contentType)
      .then(setCategories)
      .catch((err) => {
        logger.error('Failed to fetch categories:', err);
        setCategories([]);
      });
  }, [currentPlaylist?.id, contentTypeFilter, setCategories]);

  // Pre-compute parental blocking results (avoids per-card shouldBlockChannel calls)
  const blockedMap = useMemo(() => {
    if (!parentalEnabled || parentalUnlocked) return new Map<number, boolean>();

    const map = new Map<number, boolean>();
    for (const channel of filteredChannels) {
      if (channel.id) {
        map.set(
          channel.id,
          shouldBlockChannel(channel, {
            enabled: parentalEnabled,
            autoDetect: parentalAutoDetect,
            blockedIds: blockedChannelIds,
            blockedCategories: blockedCategories,
            unlocked: parentalUnlocked,
          })
        );
      }
    }
    return map;
  }, [
    filteredChannels,
    parentalEnabled,
    parentalUnlocked,
    parentalAutoDetect,
    blockedChannelIds,
    blockedCategories,
  ]);

  // Lookup for Continue Watching parental filtering (avoids O(entries * channels) scans)
  const channelsById = useMemo(() => {
    const map = new Map<number, Channel>();
    for (const channel of channels) {
      if (channel.id) map.set(channel.id, channel);
    }
    return map;
  }, [channels]);

  // Continue Watching entries, filtered against the same parental "hide" predicate
  // the main grid uses (see useChannelFilter.ts) so blocked content doesn't sneak
  // in via the row, then scoped to the active tab so each tab only shows its own
  // kind of history ("favorites" has no content_type of its own, so it's scoped
  // via the channel's is_favorite flag instead).
  const visibleContinueWatching = useMemo(() => {
    const parentalFiltered = !(parentalEnabled && !parentalUnlocked && parentalVisibility === 'hide')
      ? continueWatching
      : continueWatching.filter((entry) => {
          const channel = channelsById.get(entry.channel_id);
          if (!channel) return false;
          return !shouldBlockChannel(channel, {
            enabled: parentalEnabled,
            autoDetect: parentalAutoDetect,
            blockedIds: blockedChannelIds,
            blockedCategories: blockedCategories,
            unlocked: parentalUnlocked,
          });
        });

    if (contentTypeFilter === 'all') return parentalFiltered;
    if (contentTypeFilter === 'favorites') {
      return parentalFiltered.filter((entry) => channelsById.get(entry.channel_id)?.is_favorite);
    }
    return parentalFiltered.filter((entry) => entry.content_type === contentTypeFilter);
  }, [
    continueWatching,
    channelsById,
    parentalEnabled,
    parentalUnlocked,
    parentalAutoDetect,
    blockedChannelIds,
    blockedCategories,
    parentalVisibility,
    contentTypeFilter,
  ]);

  // Virtual scrolling setup - virtualize by rows (dynamic items per row)
  const rowCount = Math.ceil(filteredChannels.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320, // initial guess only; measureElement (via ref below) corrects it after each row renders
    overscan: 2, // Render 2 extra rows above/below viewport (reduced from 3: cards are physically larger post-redesign, so the same row-count buffer now covers a bigger pixel/image area — most noticeable in 4K fullscreen with 6 columns)
  });

  const handlePlayChannel = useCallback(
    async (channel: Channel) => {
      // Check parental controls
      const isBlocked = shouldBlockChannel(channel, {
        enabled: parentalEnabled,
        autoDetect: parentalAutoDetect,
        blockedIds: blockedChannelIds,
        blockedCategories: blockedCategories,
        unlocked: parentalUnlocked,
      });

      if (isBlocked && parentalEnabled && !parentalUnlocked) {
        setPendingChannel(channel);
        setShowPinModal(true);
        return;
      }

      const result = await playChannelAction(channel, currentPlaylist ?? undefined);
      if (result?.type === 'series') {
        setSelectedSeries(result.channel);
      }
    },
    [
      parentalEnabled,
      parentalAutoDetect,
      blockedChannelIds,
      blockedCategories,
      parentalUnlocked,
      playChannelAction,
      currentPlaylist,
    ]
  );

  const handleSelectContinueWatching = useCallback(
    (channelId: number) => {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) handlePlayChannel(channel);
    },
    [channels, handlePlayChannel]
  );

  const handleFocusedRowChange = useCallback(
    (row: number) => rowVirtualizer.scrollToIndex(row),
    [rowVirtualizer]
  );

  const { focusedIndex, setFocusedIndex, cardRefs, handleKeyDown } = useGridKeyboardNav(
    filteredChannels,
    columns,
    handlePlayChannel,
    handleFocusedRowChange
  );

  const handlePlayEpisode = useCallback(
    async (
      episodeId: string,
      extension: string,
      title: string,
      seasonNumber: number,
      episodeNum: number,
      remainingEpisodes?: Array<{ id: string; title: string; extension: string }>
    ) => {
      if (!currentPlaylist || !selectedSeries?.id) return;
      try {
        await playEpisodeAction(
          selectedSeries.id,
          episodeId,
          extension,
          title,
          seasonNumber,
          episodeNum,
          currentPlaylist,
          remainingEpisodes
        );
      } catch (err) {
        logger.error('Failed to play episode:', err);
      }
    },
    [currentPlaylist, selectedSeries, playEpisodeAction]
  );

  const handlePinSuccess = useCallback(() => {
    setShowPinModal(false);
    if (pendingChannel) {
      playChannelAction(pendingChannel, currentPlaylist ?? undefined)
        .then((result) => {
          if (result?.type === 'series') {
            setSelectedSeries(result.channel);
          }
          setPendingChannel(null);
        })
        .catch((err) => {
          logger.error('Failed to play channel after PIN:', err);
        });
    }
  }, [pendingChannel, playChannelAction, currentPlaylist]);

  const handleStop = useCallback(async () => {
    await stopPlaybackAction();
  }, [stopPlaybackAction]);

  // If a series is selected, show the SeriesView
  if (
    selectedSeries &&
    currentPlaylist?.url &&
    currentPlaylist.xtream_username &&
    currentPlaylist.xtream_password
  ) {
    // Extract series ID from the URL (format: /series/user/pass/SERIES_ID.mp4)
    const urlParts = selectedSeries.url?.split('/');
    const seriesIdWithExt = urlParts?.[urlParts.length - 1];
    const seriesId = seriesIdWithExt ? parseInt(seriesIdWithExt.replace(/\.\w+$/, ''), 10) : NaN;

    // Handle invalid series ID
    if (isNaN(seriesId)) {
      logger.error('Failed to parse series ID from URL:', selectedSeries.url);
      return (
        <div className="flex h-screen items-center justify-center bg-bg">
          <div className="text-center">
            <p className="mb-4 text-red-400">Failed to load series: Invalid URL format</p>
            <button
              onClick={() => setSelectedSeries(null)}
              className="rounded-lg bg-accent px-5 py-2.5 text-white hover:bg-accent-hover"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <SeriesView
        seriesId={seriesId}
        channelId={selectedSeries.id}
        seriesName={selectedSeries.name}
        serverUrl={currentPlaylist.url}
        username={currentPlaylist.xtream_username}
        password={currentPlaylist.xtream_password}
        onBack={() => setSelectedSeries(null)}
        onPlayEpisode={handlePlayEpisode}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        <div className="mx-auto flex items-center justify-between px-2">
          <h1 className="text-fluid-2xl font-bold text-text">Better IPTV</h1>
          <div className="flex items-center gap-6">
            <span className="text-fluid-sm text-text-muted">
              {channels.length} channels
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg p-3 transition-colors hover:bg-surface-hover"
              title="Settings"
            >
              <SettingsIcon className="h-6 w-6 text-text-muted" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Type Tabs */}
      <ContentTypeTabs activeFilter={contentTypeFilter} onFilterChange={setContentTypeFilter} />

      {/* Search Bar */}
      <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />

      {/* Continue Watching - scoped to the active tab; renders nothing when empty */}
      <ContinueWatchingRow
        entries={visibleContinueWatching}
        onSelect={handleSelectContinueWatching}
      />

      {/* Category Sidebar + Channel List with Virtual Scrolling */}
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar />
        <div
          ref={parentRef}
          onKeyDown={handleKeyDown}
          className="flex-1 overflow-y-auto"
          id="channel-list"
          role="tabpanel"
          aria-label="Channel list"
        >
          <div className="mx-auto p-6">
            {filteredChannels.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-fluid-base text-text-muted">
                  {searchQuery ? 'No channels found' : 'No channels available'}
                </p>
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const startIndex = virtualRow.index * columns;
                  const rowItems = filteredChannels.slice(startIndex, startIndex + columns);

                  return (
                    <div
                      key={virtualRow.key}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        willChange: 'transform',
                      }}
                    >
                      <div
                        className="grid gap-6 pb-6"
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                      >
                        {rowItems.map((channel, colIdx) => {
                          const channelIndex = startIndex + colIdx;
                          const isChannelBlocked = blockedMap.get(channel.id!) ?? false;

                          return (
                            <ChannelCard
                              key={channel.id}
                              channel={channel}
                              isPlaying={currentChannel?.id === channel.id && isPlaying}
                              onPlay={handlePlayChannel}
                              onToggleFavorite={toggleChannelFavorite}
                              currentProgram={channelEpgData.get(channel.id)}
                              posterMode={isPosterTab}
                              isBlocked={isChannelBlocked}
                              parentalVisibility={parentalVisibility}
                              isFocused={focusedIndex === channelIndex}
                              cardRef={(el) => {
                                cardRefs.current[channelIndex] = el;
                              }}
                              onFocus={() => setFocusedIndex(channelIndex)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Now Playing Bar */}
      {currentChannel && (
        <NowPlayingBar
          channel={currentChannel}
          currentProgram={currentProgram}
          nextProgram={nextProgram}
          onStop={handleStop}
        />
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* PIN Entry Modal for blocked channels */}
      <PinEntryModal
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setPendingChannel(null);
        }}
        onSuccess={handlePinSuccess}
        mode="verify"
        title="Enter PIN to access this channel"
      />

      {/* Stale playlist prompt */}
      <ConfirmationModal
        isOpen={showStalePrompt}
        onClose={() => setShowStalePrompt(false)}
        onConfirm={() => {
          setShowStalePrompt(false);
          setShowRefreshModal(true);
        }}
        title="Playlist Update Available"
        message="Your playlist hasn't been updated in over 7 days. Would you like to refresh it now?"
        confirmText="Refresh Now"
        cancelText="Later"
      />

      {/* Refresh modal */}
      {stalePlaylistId && currentPlaylist && (
        <RefreshModal
          isOpen={showRefreshModal}
          onClose={() => {
            setShowRefreshModal(false);
            setStalePlaylistId(null);
          }}
          playlistId={stalePlaylistId}
          playlistName={currentPlaylist.name}
          onRefreshComplete={async () => {
            if (currentPlaylist.id) {
              try {
                const freshChannels = await getChannels(currentPlaylist.id);
                setChannels(freshChannels);
                loadContinueWatching(currentPlaylist.id);
              } catch (err) {
                logger.error('Failed to reload channels after refresh:', err);
              }
            }
          }}
        />
      )}
    </div>
  );
}

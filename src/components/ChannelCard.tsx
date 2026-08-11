import { memo } from 'react';
import { Play, Square, Star, Clapperboard, Lock } from 'lucide-react';
import type { Channel } from '../types';

interface ChannelCardProps {
  channel: Channel;
  /** Whether this channel is currently playing */
  isPlaying: boolean;
  /** Callback when play/stop button is clicked */
  onPlay: (channel: Channel) => void;
  /** Current EPG program title */
  currentProgram?: string;
  /** DVD-cover-style tall poster layout (Movies/Series tabs) vs. the standard landscape logo tile */
  posterMode?: boolean;
  /** Whether this channel is blocked by parental controls */
  isBlocked?: boolean;
  /** Visibility mode for blocked channels */
  parentalVisibility?: 'hide' | 'lock' | 'blur';
  /** Callback when favorite star is toggled */
  onToggleFavorite?: (channelId: number) => void;
  /** Whether this card is the currently keyboard/D-pad focused card in the grid */
  isFocused: boolean;
  /** Ref callback so the grid can call .focus() on this card programmatically */
  cardRef: (el: HTMLDivElement | null) => void;
  /** Called when this card receives DOM focus (click or keyboard), to sync grid state */
  onFocus: () => void;
}

/**
 * Channel card component
 *
 * Displays a single channel in the grid with:
 * - Channel logo or initial letter
 * - Favorite indicator
 * - Channel name and group
 * - Current EPG program (for live channels)
 * - Play/Stop/Browse button based on content type
 */
export const ChannelCard = memo(function ChannelCard({
  channel,
  isPlaying,
  onPlay,
  currentProgram,
  posterMode = false,
  isBlocked = false,
  parentalVisibility = 'hide',
  onToggleFavorite,
  isFocused,
  cardRef,
  onFocus,
}: ChannelCardProps) {
  return (
    <div
      ref={cardRef}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      className={`relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all hover:shadow-lg hover:opacity-100 ${
        isFocused ? 'opacity-100 ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'opacity-75'
      }`}
    >
      {/* Logo/Image section */}
      <div className={`group relative flex-shrink-0 bg-bg ${posterMode ? 'p-3' : ''}`}>
        {channel.logo ? (
          <div
            className={`flex w-full items-center justify-center bg-bg ${posterMode ? 'aspect-[2/3]' : 'aspect-video'}`}
          >
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              decoding="async"
              className={
                posterMode
                  ? 'h-full w-full rounded-lg border border-border object-contain shadow-md'
                  : 'h-full w-full object-cover'
              }
            />
          </div>
        ) : (
          <div
            className={`flex w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 ${posterMode ? 'aspect-[2/3]' : 'aspect-video'}`}
          >
            <span className="text-fluid-2xl font-bold text-white">
              {channel.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={channel.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(channel.id);
          }}
          className={`absolute right-2 top-2 rounded-full p-1 transition-opacity ${
            channel.is_favorite
              ? 'bg-yellow-400 opacity-100'
              : 'bg-black/40 opacity-0 hover:bg-black/60 group-hover:opacity-100'
          }`}
        >
          <Star
            className={`h-4 w-4 ${
              channel.is_favorite ? 'fill-white text-white' : 'text-white'
            }`}
          />
        </button>
      </div>

      {/* Content section */}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <h3 className="truncate text-fluid-lg font-medium text-text">{channel.name}</h3>
        {channel.group_name && (
          <p className="mt-0.5 truncate text-fluid-sm text-text-muted">
            {channel.group_name}
          </p>
        )}
        {currentProgram && channel.content_type === 'live' && (
          <p
            className="mt-0.5 truncate text-fluid-sm text-accent"
            title={currentProgram}
          >
            📺 {currentProgram}
          </p>
        )}
        <div className="flex-1" />

        {/* Action button */}
        <button
          tabIndex={-1}
          onClick={() => onPlay(channel)}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 font-medium text-fluid-sm transition-colors ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : channel.content_type === 'series' ? (
            <>
              <Clapperboard className="h-4 w-4" />
              Browse
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Play
            </>
          )}
        </button>
      </div>

      {/* Parental Controls Overlay */}
      {isBlocked && parentalVisibility !== 'hide' && (
        <div
          onClick={(e) => {
            e.stopPropagation(); // Prevent card click
            onPlay(channel); // Trigger PIN verification
          }}
          className={`absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity hover:opacity-90 ${
            parentalVisibility === 'blur' ? 'bg-black/30 backdrop-blur-md' : 'bg-black/70'
          }`}
          title="Click to unlock with PIN"
        >
          <Lock className="h-12 w-12 text-white drop-shadow-lg" />
        </div>
      )}
    </div>
  );
});

export default ChannelCard;

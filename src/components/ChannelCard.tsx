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
  /** Height of the card in pixels */
  cardHeight: number;
  /** Whether this channel is blocked by parental controls */
  isBlocked?: boolean;
  /** Visibility mode for blocked channels */
  parentalVisibility?: 'hide' | 'lock' | 'blur';
  /** Callback when favorite star is toggled */
  onToggleFavorite?: (channelId: number) => void;
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
  cardHeight,
  isBlocked = false,
  parentalVisibility = 'hide',
  onToggleFavorite,
}: ChannelCardProps) {
  // Calculate dynamic image height (approximately 45% of card height)
  const imageHeight = Math.max(80, Math.round(cardHeight * 0.45));

  // Scale text and padding based on card height
  const isLarge = cardHeight > 280;
  const isSmall = cardHeight < 220;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-lg"
      style={{ height: `${cardHeight}px` }}
    >
      {/* Logo/Image section */}
      <div className="group relative flex-shrink-0 bg-bg">
        {channel.logo ? (
          <div
            className="flex w-full items-center justify-center bg-bg"
            style={{ height: `${imageHeight}px` }}
          >
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"
            style={{ height: `${imageHeight}px` }}
          >
            <span
              className={`font-bold text-white ${isLarge ? 'text-4xl' : isSmall ? 'text-2xl' : 'text-3xl'}`}
            >
              {channel.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <button
          type="button"
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
            className={`${isSmall ? 'h-3 w-3' : 'h-4 w-4'} ${
              channel.is_favorite ? 'fill-white text-white' : 'text-white'
            }`}
          />
        </button>
      </div>

      {/* Content section */}
      <div className={`${isLarge ? 'p-6' : isSmall ? 'p-3' : 'p-5'} flex min-h-0 flex-1 flex-col`}>
        <h3
          className={`truncate font-medium text-text ${isLarge ? 'text-fluid-lg' : 'text-fluid-base'}`}
        >
          {channel.name}
        </h3>
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
          onClick={() => onPlay(channel)}
          className={`flex w-full items-center justify-center gap-2 rounded-lg font-medium text-fluid-sm transition-colors ${
            isLarge ? 'mt-4 px-5 py-3' : isSmall ? 'mt-3 px-4 py-2' : 'mt-3 px-5 py-2.5'
          } ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : channel.content_type === 'series'
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className={`${isSmall ? 'h-3 w-3' : 'h-4 w-4'}`} />
              Stop
            </>
          ) : channel.content_type === 'series' ? (
            <>
              <Clapperboard className={`${isSmall ? 'h-3 w-3' : 'h-4 w-4'}`} />
              Browse
            </>
          ) : (
            <>
              <Play className={`${isSmall ? 'h-3 w-3' : 'h-4 w-4'}`} />
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

import { memo } from 'react';
import { Square } from 'lucide-react';
import type { Channel } from '../types';

interface NowPlayingBarProps {
  /** Currently playing channel */
  channel: Channel;
  /** Current EPG program title */
  currentProgram?: string | null;
  /** Next EPG program title */
  nextProgram?: string | null;
  /** Callback when stop button is clicked */
  onStop: () => void;
}

/**
 * Now Playing bar component
 *
 * Displays information about the currently playing channel including:
 * - Channel logo and name
 * - Group/category
 * - Current and next EPG program
 * - Stop button
 */
export const NowPlayingBar = memo(function NowPlayingBar({
  channel,
  currentProgram,
  nextProgram,
  onStop,
}: NowPlayingBarProps) {
  return (
    <div className="bg-accent p-6 text-white">
      <div className="mx-auto flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {channel.logo && (
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-black/20">
              <img
                src={channel.logo}
                alt={channel.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div>
            <p className="text-fluid-lg font-medium">{channel.name}</p>
            <p className="text-fluid-sm text-white/80">{channel.group_name || 'Live TV'}</p>
            {currentProgram && (
              <p className="mt-1 text-fluid-sm text-white/90">
                <span className="font-medium">Now showing:</span> {currentProgram}
              </p>
            )}
            {nextProgram && (
              <p className="mt-0.5 text-fluid-xs text-white/90">
                <span className="font-medium">Next up:</span> {nextProgram}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onStop}
          className="rounded-lg bg-white/20 p-3 transition-colors hover:bg-white/30"
          aria-label="Stop playback"
        >
          <Square className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
});

export default NowPlayingBar;

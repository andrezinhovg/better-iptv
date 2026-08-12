import { memo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useIsCompactViewport } from '../hooks/useIsCompactViewport';
import type { ContinueWatchingEntry } from '../types';

interface ContinueWatchingRowProps {
  /** Most-recently-watched items, most recent first */
  entries: ContinueWatchingEntry[];
  /** Callback with the channel_id of the selected entry */
  onSelect: (channelId: number) => void;
}

/**
 * Horizontal "Continue Watching" strip shown above the channel grid on the
 * "All" tab. Renders nothing when there's no watch history yet.
 *
 * On short viewports (≤1080px tall) it collapses to a thin header strip and
 * expands as a floating overlay on hover, keyboard focus, or click — so it
 * never pushes categories/grid out of view the way a permanently expanded
 * row would on a notebook screen.
 */
export const ContinueWatchingRow = memo(function ContinueWatchingRow({
  entries,
  onSelect,
}: ContinueWatchingRowProps) {
  const isCompact = useIsCompactViewport();
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);

  if (entries.length === 0) return null;

  const expanded = !isCompact || pinned || hovering || focused;

  const cards = (
    <div className="flex gap-4 overflow-x-auto">
      {entries.map((entry) => (
        <button
          key={entry.channel_id}
          onClick={() => onSelect(entry.channel_id)}
          className="flex w-56 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-bg text-left transition-shadow hover:shadow-lg"
        >
          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
            {entry.logo ? (
              <img
                src={entry.logo}
                alt={entry.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-fluid-2xl font-bold text-white">
                {entry.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="p-3">
            <p className="truncate text-fluid-base font-medium text-text">{entry.name}</p>
            {entry.content_type === 'series' &&
              entry.season_number != null &&
              entry.episode_num != null && (
                <p className="truncate text-fluid-sm text-text-muted">
                  T{entry.season_number} E{entry.episode_num}
                </p>
              )}
          </div>
        </button>
      ))}
    </div>
  );

  if (!isCompact) {
    return (
      <div className="border-b border-border bg-surface">
        <div className="mx-auto px-6 py-5">
          <h2 className="mb-3 text-fluid-sm font-medium text-text-muted">Continue Watching</h2>
          {cards}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex-shrink-0 border-b-2 border-accent bg-surface-hover"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
    >
      <button
        onClick={() => {
          setPinned((p) => !p);
          setHovering(false);
          setFocused(false);
        }}
        aria-expanded={expanded}
        className="flex h-10 w-full items-center justify-between px-6 text-fluid-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
      >
        <h2 className="contents">Continue Watching</h2>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="absolute inset-x-0 top-10 z-10 max-h-[50vh] overflow-y-auto border-b border-border bg-surface px-6 pb-5 pt-5 shadow-lg">
          {cards}
        </div>
      )}
    </div>
  );
});

export default ContinueWatchingRow;

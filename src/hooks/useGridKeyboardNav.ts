import { useState, useEffect, useCallback } from 'react';
import type { Channel } from '../types';

interface GridKeyboardNav {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Roving-tabindex keyboard/D-pad navigation for a row-major channel grid.
 * Arrow keys move a single focused card; Enter activates it via onPlay.
 * Edges clamp — an arrow that would leave the grid (including leaving a
 * row via Left/Right) is a no-op, it never wraps to another row.
 */
export function useGridKeyboardNav(
  channels: Channel[],
  columns: number,
  onPlay: (channel: Channel) => void
): GridKeyboardNav {
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Create a stable key from channel IDs to detect list changes
  const channelKey = channels.map(c => c.id).join(',');

  // Reset focus whenever the filtered list changes (search/category/tab
  // switch) so the highlight never points at a channel that scrolled out
  // of the result set.
  useEffect(() => {
    setFocusedIndex(0);
  }, [channelKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (channels.length === 0) return;

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const isLastColumn = (focusedIndex + 1) % columns === 0;
          const isLastItem = focusedIndex === channels.length - 1;
          if (!isLastColumn && !isLastItem) setFocusedIndex(focusedIndex + 1);
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const isFirstColumn = focusedIndex % columns === 0;
          if (!isFirstColumn) setFocusedIndex(focusedIndex - 1);
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const next = focusedIndex + columns;
          if (next < channels.length) setFocusedIndex(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = focusedIndex - columns;
          if (prev >= 0) setFocusedIndex(prev);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          onPlay(channels[focusedIndex]);
          break;
        }
      }
    },
    [channels, columns, focusedIndex, onPlay]
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown };
}

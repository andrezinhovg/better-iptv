import { useState, useEffect, type RefObject } from 'react';

export interface GridConfig {
  columns: number;
  gap: number;
}

const MIN_CARD_WIDTH = 220; // px, minimum comfortable card width
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 8;
const GAP = 24; // Tailwind gap-6

/** Same column-resolution math CSS `auto-fit` would use, kept in JS so a
 * single integer can drive both `grid-template-columns` and the
 * index-arithmetic in useGridKeyboardNav without the two ever drifting apart. */
export function computeColumns(containerWidth: number): number {
  if (containerWidth <= 0) return MIN_COLUMNS;
  const raw = Math.floor((containerWidth + GAP) / (MIN_CARD_WIDTH + GAP));
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, raw));
}

/** Column count derived from the real measured width of `containerRef`,
 * via ResizeObserver — reacts correctly to sidebar/Continue-Watching
 * changes and anything else that changes the container's actual size,
 * instead of guessing from window dimensions and hardcoded offsets. */
export function useResponsiveGrid(containerRef: RefObject<HTMLElement | null>): GridConfig {
  const [columns, setColumns] = useState(MIN_COLUMNS);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setColumns((prev) => {
        const next = computeColumns(width);
        return next === prev ? prev : next;
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
    // containerRef.current is intentionally a dep: MainScreen unmounts/remounts
    // this container when swapping to SeriesView and back (Browse -> Go Back),
    // which swaps in a brand new DOM node under the same stable ref object. Without
    // watching .current, the observer stays attached to the old detached node and
    // columns freezes at MIN_COLUMNS forever once the container is later hidden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, containerRef.current]);

  return { columns, gap: GAP };
}

import { useState, useEffect, useCallback } from 'react';

interface GridConfig {
  columns: number;
  cardHeight: number;
  estimatedRowHeight: number;
  gap: number;
}

interface BreakpointConfig {
  minWidth: number;
  columns: number;
  minCardHeight: number;
  maxCardHeight: number;
}

// Breakpoint configuration - easily adjustable
const BREAKPOINTS: BreakpointConfig[] = [
  { minWidth: 0, columns: 2, minCardHeight: 240, maxCardHeight: 300 },
  { minWidth: 640, columns: 3, minCardHeight: 260, maxCardHeight: 320 },
  { minWidth: 1024, columns: 4, minCardHeight: 300, maxCardHeight: 380 },
  { minWidth: 1440, columns: 4, minCardHeight: 340, maxCardHeight: 420 },
  { minWidth: 1920, columns: 5, minCardHeight: 380, maxCardHeight: 480 },
  { minWidth: 2560, columns: 6, minCardHeight: 420, maxCardHeight: 540 },
];

const GAP = 24; // Tailwind gap-6 (Task 6 widened the grid gap to match)
const HEADER_HEIGHT = 200; // Approximate header + search + tabs height
const NOW_PLAYING_HEIGHT = 100; // Now playing bar
const PADDING = 32; // Container padding
const VISIBLE_ROWS = 4; // Target number of visible rows

function getBreakpointConfig(width: number): BreakpointConfig {
  // Find the highest matching breakpoint
  let config = BREAKPOINTS[0];
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) {
      config = bp;
    }
  }
  return config;
}

function calculateGridConfig(viewportWidth: number, viewportHeight: number): GridConfig {
  const breakpoint = getBreakpointConfig(viewportWidth);

  // Calculate available height for the grid
  const availableHeight = viewportHeight - HEADER_HEIGHT - NOW_PLAYING_HEIGHT - PADDING;

  // Calculate ideal card height to show VISIBLE_ROWS rows
  // Total height = (cardHeight + gap) * rows - gap (no gap after last row)
  // availableHeight = (cardHeight + gap) * VISIBLE_ROWS - gap
  // cardHeight = (availableHeight + gap) / VISIBLE_ROWS - gap
  const idealCardHeight = (availableHeight + GAP) / VISIBLE_ROWS - GAP;

  // Clamp card height within breakpoint bounds
  const cardHeight = Math.max(
    breakpoint.minCardHeight,
    Math.min(breakpoint.maxCardHeight, idealCardHeight)
  );

  // Row height includes gap for virtualizer
  const estimatedRowHeight = cardHeight + GAP;

  return {
    columns: breakpoint.columns,
    cardHeight: Math.round(cardHeight),
    estimatedRowHeight: Math.round(estimatedRowHeight),
    gap: GAP,
  };
}

export function useResponsiveGrid(): GridConfig {
  const [gridConfig, setGridConfig] = useState<GridConfig>(() => {
    // Initial calculation based on window size (or defaults for SSR)
    if (typeof window !== 'undefined') {
      return calculateGridConfig(window.innerWidth, window.innerHeight);
    }
    return {
      columns: 4,
      cardHeight: 280,
      estimatedRowHeight: 296,
      gap: GAP,
    };
  });

  const handleResize = useCallback(() => {
    const newConfig = calculateGridConfig(window.innerWidth, window.innerHeight);
    setGridConfig((prev) => {
      // Only update if values changed to prevent unnecessary re-renders
      if (
        prev.columns !== newConfig.columns ||
        prev.cardHeight !== newConfig.cardHeight ||
        prev.estimatedRowHeight !== newConfig.estimatedRowHeight
      ) {
        return newConfig;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    // Initial calculation
    handleResize();

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, [handleResize]);

  return gridConfig;
}

// Utility to generate Tailwind grid classes based on columns
export function getGridClasses(columns: number): string {
  const gridColsMap: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
  };
  return gridColsMap[columns] || 'grid-cols-4';
}

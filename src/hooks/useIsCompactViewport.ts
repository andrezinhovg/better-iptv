import { useState, useEffect } from 'react';

/** True while the viewport is shorter than maxHeightPx — used to switch
 * layout-hungry UI (like ContinueWatchingRow) into a collapsible mode on
 * notebooks/short monitors, while leaving tall viewports untouched. */
export function useIsCompactViewport(maxHeightPx = 1080): boolean {
  const query = `(max-height: ${maxHeightPx}px)`;
  const [isCompact, setIsCompact] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setIsCompact(mql.matches);

    const handler = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return isCompact;
}

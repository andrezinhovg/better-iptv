# Continue Watching auto-collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Continue Watching" row auto-collapse to a thin header strip on short viewports (≤1080px tall), expanding as a non-pushing overlay on hover, focus, or click.

**Architecture:** A new `useIsCompactViewport` hook (matchMedia-based, mirrors `useResponsiveGrid`'s style) drives a boolean in `ContinueWatchingRow`. On tall viewports the component renders exactly as it does today. On short viewports it renders a fixed 40px header button (title + chevron) that always occupies flow space, plus an absolutely-positioned panel with the cards that mounts only while `pinned` (click-toggled) or `hovering` (mouse enter/leave, or focus/blur bubbled from any descendant) is true.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest + @testing-library/react (`renderHook`), lucide-react icons. No new dependencies.

## Global Constraints

- Threshold is viewport **height** ≤ 1080px (`matchMedia('(max-height: 1080px)')`) — not width, not full screen resolution.
- On viewports above the threshold, behavior is byte-for-byte identical to today (always expanded, no collapse UI).
- No `pinned` persistence across reloads (matches `CategorySidebar.isOpen`'s existing behavior — resets to collapsed on every mount).
- No new npm dependencies — lucide-react (`^0.553.0`) and Tailwind are already installed and used for the equivalent `CategorySidebar` collapse pattern.
- No dedicated component-render test for `ContinueWatchingRow` — the project has zero component-render tests today (only hooks/lib/stores, per `src/test/`), and the spec explicitly keeps that convention. Verification for Task 2 is manual, via the dev server.
- The new hook follows `useResponsiveGrid.ts`'s existing style: small file, `useState` + `useEffect`, JSDoc-free unless a non-obvious constraint needs explaining.

---

## Task 1: `useIsCompactViewport` hook

**Files:**
- Create: `src/hooks/useIsCompactViewport.ts`
- Test: `src/test/hooks/useIsCompactViewport.test.ts`
- Modify: `src/hooks/index.ts`

**Interfaces:**
- Produces: `useIsCompactViewport(maxHeightPx = 1080): boolean` — `true` when `window.matchMedia('(max-height: {maxHeightPx}px)').matches` is currently true, updates live as the media query's `change` event fires.

- [ ] **Step 1: Write the failing test**

Create `src/test/hooks/useIsCompactViewport.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsCompactViewport } from '../../hooks/useIsCompactViewport';

/** Replaces window.matchMedia with a controllable fake for one query,
 * capturing the 'change' listener so tests can fire it manually. */
function mockMatchMedia(initialMatches: boolean) {
  let changeHandler: ((event: { matches: boolean }) => void) | undefined;
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler;
    }),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    mql,
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      changeHandler?.({ matches });
    },
  };
}

describe('useIsCompactViewport', () => {
  it('returns true when the viewport already matches on mount', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsCompactViewport());
    expect(result.current).toBe(true);
  });

  it('returns false when the viewport does not match on mount', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsCompactViewport());
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    const { fireChange } = mockMatchMedia(false);
    const { result } = renderHook(() => useIsCompactViewport());
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });

    expect(result.current).toBe(true);
  });

  it('unsubscribes the change listener on unmount', () => {
    const { mql } = mockMatchMedia(false);
    const { unmount } = renderHook(() => useIsCompactViewport());

    unmount();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('queries with a custom threshold when provided', () => {
    mockMatchMedia(true);
    renderHook(() => useIsCompactViewport(720));
    expect(window.matchMedia).toHaveBeenCalledWith('(max-height: 720px)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/hooks/useIsCompactViewport.test.ts`
Expected: FAIL — `Cannot find module '../../hooks/useIsCompactViewport'` (or similar resolution error), since the hook doesn't exist yet.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useIsCompactViewport.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/hooks/useIsCompactViewport.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Add the barrel export**

In `src/hooks/index.ts`, extend the existing "Grid and layout" section (currently only `useResponsiveGrid`):

```ts
// Grid and layout
export { useResponsiveGrid, computeColumns, type GridConfig } from './useResponsiveGrid';
export { useIsCompactViewport } from './useIsCompactViewport';
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS, no new failures, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useIsCompactViewport.ts src/test/hooks/useIsCompactViewport.test.ts src/hooks/index.ts
git commit -m "feat: add useIsCompactViewport hook for short-viewport detection"
```

---

## Task 2: Collapsible `ContinueWatchingRow`

**Files:**
- Modify: `src/components/ContinueWatchingRow.tsx` (full rewrite of the component body, lines 1-66)

**Interfaces:**
- Consumes: `useIsCompactViewport(): boolean` from Task 1 (`src/hooks/useIsCompactViewport.ts`).
- Produces: no change to `ContinueWatchingRowProps` (`entries: ContinueWatchingEntry[]`, `onSelect: (channelId: number) => void`) or to the default export — `MainScreen.tsx:397` needs no changes.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/ContinueWatchingRow.tsx`:

```tsx
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

  if (entries.length === 0) return null;

  const expanded = !isCompact || pinned || hovering;

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
      className="relative flex-shrink-0 border-b border-border bg-surface"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHovering(false);
        }
      }}
    >
      <button
        onClick={() => setPinned((p) => !p)}
        aria-expanded={expanded}
        className="flex h-10 w-full items-center justify-between px-6 text-fluid-sm font-medium text-text-muted hover:bg-surface-hover"
      >
        <span>Continue Watching</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="absolute inset-x-0 top-10 z-10 border-b border-border bg-surface px-6 pb-5 shadow-lg">
          {cards}
        </div>
      )}
    </div>
  );
});

export default ContinueWatchingRow;
```

Notes for the implementer:
- `expanded` folds in `!isCompact` so tall viewports keep rendering the exact pre-existing markup via the early `if (!isCompact)` branch — the collapsible branch below it never runs there.
- The `onBlur` check (`e.currentTarget.contains(e.relatedTarget as Node)`) is what makes Tab navigation work: React's `onFocus`/`onBlur` bubble (unlike native DOM focus/blur), so this fires once for the whole subtree, closing the peek only when focus actually leaves the header+overlay, not when it moves from the header button into a card.
- `aria-expanded` on the toggle button gives screen readers the collapsed/expanded state; no other ARIA changes needed since the overlay is still a normal part of the DOM (just visually floating), not a portal.

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS. No test exercises `ContinueWatchingRow` directly today, so this step is a regression check on everything else (store/hook tests, type errors from the prop/JSX changes).

- [ ] **Step 3: Manual verification via the dev server**

Run: `npm run dev`, open the app in a browser.

Check, with at least one item in Continue Watching (play any channel first so an entry exists):

1. **Tall window** (resize browser so viewport height is clearly > 1080px, e.g. maximize on a 1440p+ display): row renders exactly as before — always expanded, no chevron, no collapse.
2. **Short window** (resize so viewport height is ≤ 1080px, e.g. ~800px tall): row collapses to the thin header strip with a down-chevron.
3. **Hover**: moving the mouse over the collapsed header expands the overlay with cards; moving the mouse away (without having clicked) collapses it again.
4. **Click to pin**: clicking the header while collapsed expands it and flips the chevron up; moving the mouse away now leaves it expanded (pinned). Clicking again collapses it.
5. **Keyboard**: with the row collapsed and mouse away from it, press Tab until the "Continue Watching" header button receives focus — the overlay should expand. Continue tabbing into the cards — it should stay expanded. Tab past the last card (into categories/grid) — it should collapse (if not pinned).
6. **No layout shift**: while collapsed or expanded on a short window, confirm the categories sidebar and channel grid stay in place and don't jump/resize as the overlay opens and closes (it should float on top, not push anything).

- [ ] **Step 4: Commit**

```bash
git add src/components/ContinueWatchingRow.tsx
git commit -m "feat: collapse Continue Watching into a hover/click overlay on short viewports"
```

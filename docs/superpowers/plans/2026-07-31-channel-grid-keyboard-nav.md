# Channel Grid Keyboard/D-pad Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add arrow-key/D-pad navigation to the channel grid in `MainScreen.tsx`, where a single card at a time is highlighted (roving tabindex) and Enter activates it — matching the same play/browse action as clicking the card's button today.

**Architecture:** A new pure-logic hook (`useGridKeyboardNav`) owns the focused-index state and arrow-key math; `MainScreen.tsx` wires it to the existing `@tanstack/react-virtual` row virtualizer (so navigating to an off-screen row scrolls it into view before focusing); `ChannelCard.tsx` gains a focus ring and becomes the single Tab stop per card (its internal buttons drop out of the Tab sequence).

**Tech Stack:** React 19 + TypeScript, Vitest + `@testing-library/react` for hook tests, Tailwind (existing design tokens only, no new colors).

## Global Constraints

- Scope is the main channel grid only (`MainScreen.tsx` → `ChannelCard.tsx`). Modals, `SeriesView`, `SearchBar`/`CategoryBar`/`ContentTypeTabs` are out of scope.
- Favoriting via keyboard is out of scope — the star stays mouse/touch-only.
- Do not touch `useKeyboardShortcuts.ts` or its existing Space/Escape/`/` behavior. The new hook only handles Enter, never Space, to avoid conflicting with the existing global "toggle play/stop of the currently-playing channel" Space shortcut.
- No new npm dependencies. No new colors — the focus ring uses the existing `accent`/`bg` design tokens from `tailwind.config.js`.
- Edge behavior is clamp, not wrap: an arrow that would leave the grid (including leaving a row via Left/Right at its first/last column) does nothing.

---

### Task 1: `useGridKeyboardNav` core logic (focused index + arrow-key math)

**Files:**
- Create: `src/hooks/useGridKeyboardNav.ts`
- Test: `src/test/hooks/useGridKeyboardNav.test.ts`

**Interfaces:**
- Produces: `useGridKeyboardNav(channels: Channel[], columns: number, onPlay: (channel: Channel) => void): { focusedIndex: number; setFocusedIndex: (index: number) => void; handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void }`
- `Channel` type comes from `src/types/index.ts` (already exists, has `id: number`, `name: string`, etc.)

- [ ] **Step 1: Write the failing test file**

Create `src/test/hooks/useGridKeyboardNav.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridKeyboardNav } from '../../hooks/useGridKeyboardNav';
import type { Channel } from '../../types';

const makeChannel = (overrides: Partial<Channel>): Channel => ({
  id: 1,
  name: 'Test',
  url: 'http://test',
  playlist_id: 1,
  content_type: 'live',
  is_favorite: false,
  sort_order: 0,
  ...overrides,
});

// 6 channels, 3 columns -> grid layout:
// [0 1 2]
// [3 4 5]
const makeChannels = (count: number): Channel[] =>
  Array.from({ length: count }, (_, i) => makeChannel({ id: i, name: `Channel ${i}` }));

function fakeKeyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>;
}

describe('useGridKeyboardNav', () => {
  it('starts with the first card focused', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    expect(result.current.focusedIndex).toBe(0);
  });

  it('moves right within a row', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowRight')));
    expect(result.current.focusedIndex).toBe(1);
  });

  it('clamps at the right edge of a row (does not wrap to the next row)', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.setFocusedIndex(2)); // last column of row 0
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowRight')));
    expect(result.current.focusedIndex).toBe(2);
  });

  it('clamps at the left edge of a row (does not wrap to the previous row)', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.setFocusedIndex(3)); // first column of row 1
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowLeft')));
    expect(result.current.focusedIndex).toBe(3);
  });

  it('moves down a full row', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(3);
  });

  it('clamps at the bottom edge (last row, no full row below)', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.setFocusedIndex(4));
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(4);
  });

  it('clamps at the top edge', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowUp')));
    expect(result.current.focusedIndex).toBe(0);
  });

  it('resets focusedIndex to 0 when the channel list changes', () => {
    const { result, rerender } = renderHook(
      ({ channels }) => useGridKeyboardNav(channels, 3, vi.fn()),
      { initialProps: { channels: makeChannels(6) } }
    );
    act(() => result.current.setFocusedIndex(4));
    expect(result.current.focusedIndex).toBe(4);

    rerender({ channels: makeChannels(3) }); // simulates a new search/filter result
    expect(result.current.focusedIndex).toBe(0);
  });

  it('calls onPlay with the focused channel on Enter', () => {
    const onPlay = vi.fn();
    const channels = makeChannels(6);
    const { result } = renderHook(() => useGridKeyboardNav(channels, 3, onPlay));
    act(() => result.current.setFocusedIndex(4));
    act(() => result.current.handleKeyDown(fakeKeyEvent('Enter')));
    expect(onPlay).toHaveBeenCalledWith(channels[4]);
  });

  it('does nothing on arrow keys when the channel list is empty', () => {
    const { result } = renderHook(() => useGridKeyboardNav([], 3, vi.fn()));
    act(() => result.current.handleKeyDown(fakeKeyEvent('ArrowRight')));
    expect(result.current.focusedIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- useGridKeyboardNav`
Expected: FAIL — `Cannot find module '../../hooks/useGridKeyboardNav'`

- [ ] **Step 3: Implement `useGridKeyboardNav.ts`**

Create `src/hooks/useGridKeyboardNav.ts`:

```ts
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

  // Reset focus whenever the filtered list changes (search/category/tab
  // switch) so the highlight never points at a channel that scrolled out
  // of the result set.
  useEffect(() => {
    setFocusedIndex(0);
  }, [channels]);

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- useGridKeyboardNav`
Expected: PASS — all 10 tests green

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: no errors

```bash
git add src/hooks/useGridKeyboardNav.ts src/test/hooks/useGridKeyboardNav.test.ts
git commit -m "feat(grid-nav): add useGridKeyboardNav hook with arrow-key math and tests"
```

---

### Task 2: Extend the hook with DOM focus (cardRefs + virtualizer sync)

**Files:**
- Modify: `src/hooks/useGridKeyboardNav.ts`
- Modify: `src/test/hooks/useGridKeyboardNav.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces (extends Task 1's return type): adds `cardRefs: React.MutableRefObject<(HTMLDivElement | null)[]>` to the returned object. Adds a 4th parameter `onFocusedRowChange?: (row: number) => void`.
- The DOM-focus-follows-`focusedIndex` behavior (the `requestAnimationFrame` + `.focus()` call) is **not** covered by an automated test — jsdom has no real layout/virtualization, so a test here would be either trivially true or flaky. It's verified manually in Task 5. Only the synchronous `onFocusedRowChange` call is tested here.

- [ ] **Step 1: Add a failing test for `onFocusedRowChange`**

Add to `src/test/hooks/useGridKeyboardNav.test.ts` (inside the existing `describe` block):

```ts
  it('calls onFocusedRowChange with the row of the newly focused card', () => {
    const onFocusedRowChange = vi.fn();
    const { result } = renderHook(() =>
      useGridKeyboardNav(makeChannels(6), 3, vi.fn(), onFocusedRowChange)
    );
    onFocusedRowChange.mockClear(); // drop the call from initial mount

    act(() => result.current.setFocusedIndex(4)); // row 1 (4 / 3 = 1)
    expect(onFocusedRowChange).toHaveBeenCalledWith(1);
  });

  it('exposes a cardRefs ref array', () => {
    const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
    expect(result.current.cardRefs.current).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test:run -- useGridKeyboardNav`
Expected: FAIL — `onFocusedRowChange` is not called (4th param doesn't exist yet), `cardRefs` is `undefined`

- [ ] **Step 3: Extend the implementation**

In `src/hooks/useGridKeyboardNav.ts`, change the imports and function signature/body:

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Channel } from '../types';

interface GridKeyboardNav {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  cardRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function useGridKeyboardNav(
  channels: Channel[],
  columns: number,
  onPlay: (channel: Channel) => void,
  onFocusedRowChange?: (row: number) => void
): GridKeyboardNav {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [channels]);

  // Keep DOM focus in sync with focusedIndex. The row containing the
  // target card may not be mounted yet (virtualized), so scroll it into
  // view first, then wait one paint before focusing — by then the
  // virtualizer has had a chance to render the row.
  useEffect(() => {
    const row = Math.floor(focusedIndex / columns);
    onFocusedRowChange?.(row);

    const raf = requestAnimationFrame(() => {
      cardRefs.current[focusedIndex]?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedIndex, columns, onFocusedRowChange]);

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

  return { focusedIndex, setFocusedIndex, cardRefs, handleKeyDown };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- useGridKeyboardNav`
Expected: PASS — all 12 tests green

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: no errors

```bash
git add src/hooks/useGridKeyboardNav.ts src/test/hooks/useGridKeyboardNav.test.ts
git commit -m "feat(grid-nav): sync DOM focus and virtualizer scroll with focusedIndex"
```

---

### Task 3: `ChannelCard` — roving tabindex and focus ring

**Files:**
- Modify: `src/components/ChannelCard.tsx`

**Interfaces:**
- Consumes: nothing from the hook directly — receives plain props from `MainScreen.tsx` (wired in Task 4): `isFocused: boolean`, `cardRef: (el: HTMLDivElement | null) => void`, `onFocus: () => void`.
- Produces: no new exports: only the prop surface of `ChannelCardProps` changes.

- [ ] **Step 1: Add the three new props to `ChannelCardProps`**

In `src/components/ChannelCard.tsx`, modify the interface (currently lines 5-21):

```tsx
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
  /** Whether this card is the currently keyboard/D-pad focused card in the grid */
  isFocused: boolean;
  /** Ref callback so the grid can call .focus() on this card programmatically */
  cardRef: (el: HTMLDivElement | null) => void;
  /** Called when this card receives DOM focus (click or keyboard), to sync grid state */
  onFocus: () => void;
}
```

- [ ] **Step 2: Destructure the new props and wire them onto the root `<div>`**

Modify the function signature (currently lines 33-42):

```tsx
export const ChannelCard = memo(function ChannelCard({
  channel,
  isPlaying,
  onPlay,
  currentProgram,
  cardHeight,
  isBlocked = false,
  parentalVisibility = 'hide',
  onToggleFavorite,
  isFocused,
  cardRef,
  onFocus,
}: ChannelCardProps) {
```

Modify the root `<div>` (currently lines 50-53):

```tsx
    <div
      ref={cardRef}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      className={`relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-lg ${
        isFocused ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''
      }`}
      style={{ height: `${cardHeight}px` }}
    >
```

- [ ] **Step 3: Remove the favorite star and play/stop/browse buttons from the Tab sequence**

Both inner buttons are natively focusable and would otherwise still take 2 extra Tab stops per card, defeating the "one card = one Tab stop" goal. Add `tabIndex={-1}` to the favorite button (currently lines 81-93, right after the `type="button"` line):

```tsx
        <button
          type="button"
          tabIndex={-1}
          aria-label={channel.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(channel.id);
          }}
```

And to the play/stop/browse button (currently line 125):

```tsx
        <button
          tabIndex={-1}
          onClick={() => onPlay(channel)}
```

These buttons stay mouse/touch-clickable — `tabIndex={-1}` only removes them from sequential Tab navigation, it does not disable click focus.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run build` (runs `tsc` before `vite build` — will fail with a clear type error if `MainScreen.tsx` isn't passing the new required props yet; that's expected until Task 4)
Expected: TypeScript error in `MainScreen.tsx` about missing `isFocused`/`cardRef`/`onFocus` props on `<ChannelCard>` — confirms the prop contract is enforced. Do not fix `MainScreen.tsx` here, that's Task 4.

Run: `npm run lint`
Expected: no errors (lint doesn't check cross-component prop usage, only `ChannelCard.tsx` itself)

- [ ] **Step 5: Commit**

```bash
git add src/components/ChannelCard.tsx
git commit -m "feat(grid-nav): add roving tabindex and focus ring to ChannelCard"
```

---

### Task 4: Wire `useGridKeyboardNav` into `MainScreen`

**Files:**
- Modify: `src/components/MainScreen.tsx`

**Interfaces:**
- Consumes: `useGridKeyboardNav` from Task 2 (`{ focusedIndex, setFocusedIndex, cardRefs, handleKeyDown }`), the extended `ChannelCardProps` from Task 3.
- Produces: nothing new — this task only wires existing pieces together.

- [ ] **Step 1: Import the hook**

In `src/components/MainScreen.tsx`, add to the imports near the other hook imports (currently lines 18-24):

```tsx
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';
```

- [ ] **Step 2: Call the hook after `rowVirtualizer` and `handlePlayChannel` are defined**

`useGridKeyboardNav` needs `rowVirtualizer.scrollToIndex` and `handlePlayChannel`, both defined earlier in the component (currently lines 155-160 and 162-192). Insert the hook call right after the `handlePlayChannel` `useCallback` block ends (after line 192, before `handlePlayEpisode` at line 194):

```tsx
  const { focusedIndex, setFocusedIndex, cardRefs, handleKeyDown } = useGridKeyboardNav(
    filteredChannels,
    columns,
    handlePlayChannel,
    (row) => rowVirtualizer.scrollToIndex(row)
  );
```

- [ ] **Step 3: Attach `handleKeyDown` to the grid container**

Modify the grid container `<div>` (currently lines 302-308):

```tsx
      <div
        ref={parentRef}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto"
        id="channel-list"
        role="tabpanel"
        aria-label="Channel list"
      >
```

- [ ] **Step 4: Compute each card's absolute index and pass the new props**

Modify the row-items map (currently lines 341-359) to track the column index and pass `isFocused`/`cardRef`/`onFocus`:

```tsx
                    <div className={`grid ${getGridClasses(columns)} gap-6`}>
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
                            cardHeight={cardHeight}
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
```

- [ ] **Step 5: Typecheck, lint, and run the full test suite**

Run: `npm run build`
Expected: succeeds — the type error from Task 3 Step 4 is now resolved

Run: `npm run lint`
Expected: no errors

Run: `npm run test:run`
Expected: all existing tests still pass (this task doesn't add new automated tests — the behavior it wires together is verified manually in Task 5)

- [ ] **Step 6: Commit**

```bash
git add src/components/MainScreen.tsx
git commit -m "feat(grid-nav): wire keyboard navigation into the channel grid"
```

---

### Task 5: Manual verification

**Files:** none — this task runs the app and checks behavior by hand. The DOM-focus/virtualizer interaction (Task 2's riskiest part) has no automated coverage, so this is where it actually gets checked.

- [ ] **Step 1: Start the dev app**

Run: `npm run tauri dev`
Expected: app window opens with a loaded playlist (use an existing profile with channels — if none, load any test M3U/Xtream playlist first)

- [ ] **Step 2: Verify Tab reaches the grid**

Click into the search bar, then press Tab.
Expected: focus moves to the first channel card, visible as a `ring-2 ring-accent` outline around it (not the browser's default outline).

- [ ] **Step 3: Verify arrow movement and edge clamping**

With a card focused: press ArrowRight repeatedly to the end of its row, then once more.
Expected: highlight moves one card at a time; the extra press past the row's last column does nothing (stays put, does not jump to the next row).

Press ArrowDown from the first row to the last row, then once more.
Expected: highlight moves down a full row each time; pressing past the last row does nothing.

Press ArrowUp/ArrowLeft back to the first card (index 0).
Expected: further ArrowUp/ArrowLeft presses do nothing.

- [ ] **Step 4: Verify scrolling to an off-screen card**

Scroll/arrow-navigate down until the highlighted card is several rows below the current viewport's virtualized range (e.g., search for a playlist with 40+ channels, then hold ArrowDown).
Expected: the grid auto-scrolls to keep the highlighted card in view — no dead spot where the highlight appears to vanish or stop updating.

- [ ] **Step 5: Verify Enter plays the focused channel**

Navigate to a live channel card (not currently playing) and press Enter.
Expected: same result as clicking its Play button — playback starts, `NowPlayingBar` appears.

Navigate to a series card and press Enter.
Expected: same result as clicking Browse — `SeriesView` opens for that series.

- [ ] **Step 6: Verify mouse click syncs the highlight**

Click a different card with the mouse (not the Play button, the card body/logo area).
Expected: the `ring-2 ring-accent` highlight moves to the clicked card. Press an arrow key afterward.
Expected: navigation continues from the clicked card, not from wherever keyboard navigation last left off.

- [ ] **Step 7: Verify the existing Space/`/`/Escape shortcuts are unaffected**

Play a channel, then focus a *different* card via arrow keys (don't press Enter), then press Space.
Expected: Space still toggles play/stop of the channel that is *actually playing* (per `useKeyboardShortcuts.ts`), not the currently-highlighted-but-not-playing card. This confirms Task 1's constraint (Enter only, no Space) held.

- [ ] **Step 8: Redeploy to the Hyprland shortcut if everything above passed**

Run: `~/.local/bin/update-better-iptv.sh`

This is the same script used for the earlier quick-wins fixes — see `docs/superpowers/specs/` history and project memory for why the raw `main` branch alone isn't what the Hyprland menu shortcut runs.

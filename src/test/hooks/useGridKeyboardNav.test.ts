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

  it('does not call focus on the card when focus is outside the grid (e.g. search bar)', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useGridKeyboardNav(makeChannels(6), 3, vi.fn()));
      const fakeCard = { focus: vi.fn() } as unknown as HTMLDivElement;
      result.current.cardRefs.current[0] = fakeCard;

      // Simulate focus being outside the grid (e.g. on a search input, not in cardRefs)
      const outsideElement = document.createElement('input');
      document.body.appendChild(outsideElement);
      outsideElement.focus();

      act(() => result.current.setFocusedIndex(0));

      // Advance timers to execute the requestAnimationFrame callback
      act(() => vi.advanceTimersByTime(0));

      // The focus method should NOT have been called because focus is outside the grid
      expect(fakeCard.focus).not.toHaveBeenCalled();

      // Cleanup
      document.body.removeChild(outsideElement);
    } finally {
      vi.useRealTimers();
    }
  });
});

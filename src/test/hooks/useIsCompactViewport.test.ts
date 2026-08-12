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

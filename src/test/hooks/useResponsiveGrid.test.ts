import { describe, it, expect } from 'vitest';
import { computeColumns } from '../../hooks/useResponsiveGrid';

describe('computeColumns', () => {
  it('clamps to the minimum when the container has no measured width yet', () => {
    expect(computeColumns(0)).toBe(2);
  });

  it('picks a middle column count for a notebook-width container with the sidebar open', () => {
    // ~1366px window minus a 240px sidebar leaves ~1100px for the grid
    expect(computeColumns(1100)).toBe(4);
  });

  it('clamps to the maximum on a very wide (4K/TV) container', () => {
    expect(computeColumns(3800)).toBe(8);
  });

  it('never drops below the minimum for narrow containers', () => {
    expect(computeColumns(300)).toBe(2);
  });
});

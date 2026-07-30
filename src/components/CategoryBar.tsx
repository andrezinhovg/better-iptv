import { memo } from 'react';
import { usePlayerStore } from '../stores/player-store';

/**
 * Horizontal scrollable bar showing provider categories (Sweden, Norway, F1, etc.)
 * Allows quick filtering of channels by category.
 */
export const CategoryBar = memo(function CategoryBar() {
  const categories = usePlayerStore((s) => s.categories);
  const categoryFilter = usePlayerStore((s) => s.categoryFilter);
  const setCategoryFilter = usePlayerStore((s) => s.setCategoryFilter);

  // Don't render if no categories available
  if (categories.length === 0) return null;

  return (
    <div
      className="scrollbar-hide flex gap-3 overflow-x-auto bg-bg px-6 py-4 pb-8"
      role="tablist"
      aria-label="Channel categories"
    >
      {/* "All" chip - shows all channels in current content type */}
      <button
        onClick={() => setCategoryFilter(null)}
        role="tab"
        aria-selected={categoryFilter === null}
        className={`shrink-0 rounded-full px-4 py-2 text-fluid-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg ${
          categoryFilter === null
            ? 'bg-accent text-white'
            : 'bg-surface-hover text-text-muted hover:bg-surface'
        } `}
      >
        All
      </button>

      {/* Category chips from provider */}
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setCategoryFilter(category)}
          role="tab"
          aria-selected={categoryFilter === category}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-fluid-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg ${
            categoryFilter === category
              ? 'bg-accent text-white'
              : 'bg-surface-hover text-text-muted hover:bg-surface'
          } `}
        >
          {category}
        </button>
      ))}
    </div>
  );
});

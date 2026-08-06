import { memo, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { usePlayerStore } from '../stores/player-store';

/**
 * Collapsible left sidebar listing provider categories (Sweden, Norway, F1, etc.)
 * with a filter box, replacing the old horizontal chip bar for providers with
 * many categories. Collapses to a slim icon rail so it never eats layout space
 * when not needed.
 */
export const CategorySidebar = memo(function CategorySidebar() {
  const categories = usePlayerStore((s) => s.categories);
  const categoryFilter = usePlayerStore((s) => s.categoryFilter);
  const setCategoryFilter = usePlayerStore((s) => s.setCategoryFilter);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((category) => category.toLowerCase().includes(q));
  }, [categories, search]);

  // Don't render if no categories available for the current tab
  if (categories.length === 0) return null;

  if (!isOpen) {
    return (
      <div className="flex-shrink-0 border-r-2 border-accent bg-surface-hover">
        <button
          onClick={() => setIsOpen(true)}
          title="Show categories"
          aria-label="Show categories"
          className="flex h-full w-14 flex-col items-center justify-center gap-3 py-4 text-accent transition-colors hover:bg-accent hover:text-white"
        >
          <PanelLeftOpen className="h-5 w-5 flex-shrink-0" />
          <span
            className="text-fluid-xs font-semibold uppercase tracking-wide"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Categories
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-60 flex-shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-fluid-sm font-medium text-text-muted">Categories</h2>
        <button
          onClick={() => setIsOpen(false)}
          title="Hide categories"
          aria-label="Hide categories"
          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter categories..."
            className="w-full rounded-md border border-border bg-bg py-1.5 pl-8 pr-2 text-fluid-sm text-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2" role="tablist" aria-label="Channel categories">
        <button
          onClick={() => setCategoryFilter(null)}
          role="tab"
          aria-selected={categoryFilter === null}
          className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-fluid-sm font-medium transition-colors ${
            categoryFilter === null
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-surface-hover hover:text-text'
          }`}
        >
          All
        </button>
        {visibleCategories.map((category) => (
          <button
            key={category}
            onClick={() => setCategoryFilter(category)}
            role="tab"
            aria-selected={categoryFilter === category}
            title={category}
            className={`mb-1 w-full truncate rounded-lg px-3 py-2 text-left text-fluid-sm font-medium transition-colors ${
              categoryFilter === category
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-surface-hover hover:text-text'
            }`}
          >
            {category}
          </button>
        ))}
        {visibleCategories.length === 0 && (
          <p className="px-3 py-2 text-fluid-xs text-text-muted">No matches</p>
        )}
      </div>
    </div>
  );
});

export default CategorySidebar;

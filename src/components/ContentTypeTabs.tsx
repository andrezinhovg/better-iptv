import { memo } from 'react';
import { Tv, Film, Clapperboard, Star } from 'lucide-react';
import type { ContentTypeFilter } from '../hooks/useChannelFilter';

interface ContentTypeTabsProps {
  /** Currently active filter */
  activeFilter: ContentTypeFilter;
  /** Callback when filter changes */
  onFilterChange: (filter: ContentTypeFilter) => void;
}

interface TabConfig {
  value: ContentTypeFilter;
  label: string;
  icon?: React.ReactNode;
}

const TABS: TabConfig[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live TV', icon: <Tv className="h-4 w-4" aria-hidden="true" /> },
  { value: 'vod', label: 'Movies', icon: <Film className="h-4 w-4" aria-hidden="true" /> },
  {
    value: 'series',
    label: 'Series',
    icon: <Clapperboard className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'favorites',
    label: 'Favorites',
    icon: <Star className="h-4 w-4" aria-hidden="true" />,
  },
];

/**
 * Content type tabs component
 *
 * Provides tab-based navigation for filtering channels by content type:
 * - All: Show all channels
 * - Live TV: Show only live channels
 * - Movies: Show only VOD content
 * - Series: Show only series
 */
export const ContentTypeTabs = memo(function ContentTypeTabs({
  activeFilter,
  onFilterChange,
}: ContentTypeTabsProps) {
  return (
    <div className="border-b border-border bg-black">
      <div className="mx-auto px-6">
        <div className="flex gap-3 overflow-x-auto" role="tablist" aria-label="Content type filter">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeFilter === tab.value}
              aria-controls="channel-list"
              onClick={() => onFilterChange(tab.value)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-4 text-fluid-base font-medium transition-colors ${
                activeFilter === tab.value
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default ContentTypeTabs;

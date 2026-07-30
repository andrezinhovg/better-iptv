import { forwardRef, memo } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  /** Current search query */
  value: string;
  /** Callback when search query changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Search bar component for filtering channels
 *
 * Features:
 * - Search icon prefix
 * - Responsive width
 * - Dark mode support
 * - Supports ref forwarding for keyboard shortcut focus
 */
export const SearchBar = memo(
  forwardRef<globalThis.HTMLInputElement, SearchBarProps>(function SearchBar(
    { value, onChange, placeholder = 'Search channels...' },
    ref
  ) {
    return (
      <div className="border-b border-border bg-surface p-4 dark:bg-surface">
        <div className="mx-auto px-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-text-muted" />
            <input
              ref={ref}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-border py-2 pl-10 pr-4 bg-surface text-text focus:border-transparent focus:ring-2 focus:ring-accent dark:bg-surface dark:text-text"
            />
          </div>
        </div>
      </div>
    );
  })
);

export default SearchBar;

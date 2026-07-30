import { Lock } from 'lucide-react';
import type { ParentalVisibility } from './constants';

interface ParentalTabProps {
  // Enable state
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;

  // PIN state
  hasPin: boolean;
  onSetPin: () => void;
  onChangePin: () => void;
  onResetPin: () => void;

  // Blocking state
  blockedCount: number;
  onOpenChannelBlocking: () => void;

  // Auto-detect state
  autoDetect: boolean;
  onAutoDetectChange: (enabled: boolean) => void;

  // Visibility state
  visibility: ParentalVisibility;
  onVisibilityChange: (visibility: ParentalVisibility) => void;
}

export default function ParentalTab({
  enabled,
  onEnabledChange,
  hasPin,
  onSetPin,
  onChangePin,
  onResetPin,
  blockedCount,
  onOpenChannelBlocking,
  autoDetect,
  onAutoDetectChange,
  visibility,
  onVisibilityChange,
}: ParentalTabProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-4 text-fluid-lg font-semibold text-text">
          Parental Controls
        </h3>
        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-fluid-sm font-medium text-text-muted">
                Enable Parental Controls
              </p>
              <p className="text-fluid-xs text-text-muted">
                Restrict access to channels with PIN protection
              </p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              className="h-4 w-4 rounded text-accent focus:ring-accent"
            />
          </div>

          {enabled && (
            <>
              {/* PIN Setup */}
              <div>
                <label className="mb-2 block text-fluid-sm font-medium text-text-muted">
                  PIN Code
                </label>
                {hasPin ? (
                  <div className="flex gap-2">
                    <button
                      onClick={onChangePin}
                      className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                    >
                      Change PIN
                    </button>
                    <button
                      onClick={onResetPin}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      Reset PIN
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onSetPin}
                    className="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover"
                  >
                    Set PIN
                  </button>
                )}
                <p className="mt-1 text-fluid-xs text-text-muted">
                  {hasPin ? 'PIN is currently set' : 'No PIN set - parental controls inactive'}
                </p>
              </div>

              {hasPin && (
                <>
                  {/* Manual Channel Blocking */}
                  <div>
                    <label className="mb-2 block text-fluid-sm font-medium text-text-muted">
                      Blocked Channels
                    </label>
                    <button
                      onClick={onOpenChannelBlocking}
                      className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 hover:bg-surface-hover"
                    >
                      <Lock className="h-4 w-4" />
                      <span>Select Channels ({blockedCount} blocked)</span>
                    </button>
                  </div>

                  {/* Auto-detection toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-fluid-sm font-medium text-text-muted">
                        Auto-detect 18+ Content
                      </p>
                      <p className="text-fluid-xs text-text-muted">
                        Automatically blocks channels with +18, XXX, Adult in name
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoDetect}
                      onChange={(e) => onAutoDetectChange(e.target.checked)}
                      className="h-4 w-4 rounded text-accent focus:ring-accent"
                    />
                  </div>

                  {/* Visibility mode */}
                  <div>
                    <label className="mb-2 block text-fluid-sm font-medium text-text-muted">
                      Visibility Mode
                    </label>
                    <select
                      value={visibility}
                      onChange={(e) => onVisibilityChange(e.target.value as ParentalVisibility)}
                      className="w-full rounded-lg border border-border bg-surface-hover px-4 py-2 text-text focus:border-transparent focus:ring-2 focus:ring-accent dark:[color-scheme:dark]"
                    >
                      <option value="hide">Hide completely</option>
                      <option value="lock">Show with lock icon</option>
                      <option value="blur">Show blurred</option>
                    </select>
                    <p className="mt-1 text-fluid-xs text-text-muted">
                      How blocked channels appear in the list
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

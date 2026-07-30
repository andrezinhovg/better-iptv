interface PlaybackTabProps {
  hardwareAcceleration: boolean;
  onHardwareAccelerationChange: (enabled: boolean) => void;
}

export default function PlaybackTab({
  hardwareAcceleration,
  onHardwareAccelerationChange,
}: PlaybackTabProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-4 text-fluid-lg font-semibold text-text">Playback</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-fluid-sm font-medium text-text-muted">
                Hardware Acceleration
              </p>
              <p className="text-fluid-xs text-text-muted">
                Use GPU for video decoding (recommended)
              </p>
            </div>
            <input
              type="checkbox"
              checked={hardwareAcceleration}
              onChange={(e) => onHardwareAccelerationChange(e.target.checked)}
              className="h-4 w-4 rounded text-accent focus:ring-accent"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

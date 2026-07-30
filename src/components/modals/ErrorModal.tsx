import { AlertCircle, X } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonText?: string;
}

export default function ErrorModal({
  isOpen,
  onClose,
  title,
  message,
  buttonText = 'OK',
}: ErrorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-fluid-xl font-bold text-text">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-hover">
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>

        {/* Error Message */}
        <div className="mb-6">
          <p className="text-fluid-base text-text-muted">{message}</p>
        </div>

        {/* Action */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}

import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../lib/logger';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section for logging */
  section: string;
  /** Custom fallback component */
  fallback?: ReactNode;
  /** Whether to show a compact error message */
  compact?: boolean;
}

/**
 * Error Boundary component to catch JavaScript errors anywhere in the child component tree.
 * Displays a fallback UI instead of crashing the entire application.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error);
    logger.error('Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen items-center justify-center bg-bg">
          <div className="mx-4 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-16 w-16 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-fluid-xl font-semibold text-text">Something went wrong</h2>
              <p className="mb-6 text-fluid-base text-text-muted">
                An unexpected error occurred. Please try again or restart the application.
              </p>
              {this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-fluid-sm text-text-muted hover:text-text">
                    Error details
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-hover p-3 text-fluid-xs text-red-600 dark:text-red-400">
                    {this.state.error.message}
                    {this.state.error.stack && (
                      <>
                        {'\n\n'}
                        {this.state.error.stack}
                      </>
                    )}
                  </pre>
                </details>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={this.handleRetry}
                  className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-surface-hover px-4 py-2 text-text transition-colors hover:bg-border"
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Section-specific error boundary for granular error handling.
 * Shows a compact error UI that doesn't crash the entire app.
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, State> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`Error in ${this.props.section}:`, error);
    logger.error('Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Compact error UI for sections
      if (this.props.compact) {
        return (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-fluid-sm">Fel i {this.props.section}</span>
            <button
              onClick={this.handleRetry}
              className="ml-2 rounded bg-red-500/20 p-1 hover:bg-red-500/30"
              title="Försök igen"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        );
      }

      // Standard section error UI
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 p-8">
          <AlertTriangle className="mb-4 h-12 w-12 text-red-600 dark:text-red-400" />
          <h3 className="mb-2 text-fluid-lg font-medium text-text">
            Något gick fel i {this.props.section}
          </h3>
          <p className="mb-4 text-fluid-sm text-text-muted">
            Ett fel uppstod. Du kan försöka igen eller ladda om sidan.
          </p>
          {this.state.error && (
            <details className="mb-4 w-full max-w-md text-left">
              <summary className="cursor-pointer text-fluid-xs text-text-muted hover:text-text">
                Tekniska detaljer
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-hover p-2 text-fluid-xs text-red-600 dark:text-red-400">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-fluid-sm text-white hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" />
              Försök igen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap a component with a section error boundary
 */
export function withSectionErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  section: string,
  compact = false
) {
  return function WithSectionErrorBoundary(props: P) {
    return (
      <SectionErrorBoundary section={section} compact={compact}>
        <WrappedComponent {...props} />
      </SectionErrorBoundary>
    );
  };
}

export default ErrorBoundary;

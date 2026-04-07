import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-surface-950 rounded-3xl border border-red-500/10">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-3xl mb-6">
            ⚠️
          </div>
          <h2 className="text-2xl font-bold text-surface-50 mb-2">Something went wrong</h2>
          <p className="text-surface-400 max-w-md mx-auto mb-8">
            An unexpected error occurred while loading this section. Our team has been notified.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-primary-600 text-surface-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary-500 transition-all"
            >
              Reload Page
            </button>
            <Link 
              to="/"
              onClick={() => this.setState({ hasError: false })}
              className="px-6 py-3 bg-surface-800 text-surface-100 rounded-2xl font-black uppercase tracking-widest text-xs border border-surface-700 hover:bg-surface-700 transition-all"
            >
              Back to Home
            </Link>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-10 p-4 bg-surface-900 border border-surface-800 rounded-xl max-w-2xl text-left overflow-auto">
              <p className="text-red-400 font-mono text-xs">{this.state.error?.toString()}</p>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

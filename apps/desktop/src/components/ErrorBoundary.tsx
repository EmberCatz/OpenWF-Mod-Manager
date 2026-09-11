import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches render-time exceptions anywhere below it (e.g. a malformed API
// response the code didn't guard against) so one bad record shows a
// recoverable screen instead of crashing the whole webview to blank white.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <h1>Something went wrong</h1>
          <p className="error">{this.state.error.message}</p>
          <p className="muted">
            The app hit an unexpected error and can't continue safely from here. Reloading usually fixes it.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

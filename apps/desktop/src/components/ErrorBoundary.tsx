import { Component, type ErrorInfo, type ReactNode } from "react";
import { buildIssueUrl } from "../crashReport";
import ExternalLink from "./ExternalLink";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

// Catches render-time exceptions anywhere below it (e.g. a malformed API
// response the code didn't guard against) so one bad record shows a
// recoverable screen instead of crashing the whole webview to blank white.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      const issueUrl = buildIssueUrl({
        message: this.state.error.message,
        stack: this.state.componentStack ?? this.state.error.stack,
        context: "Render crash (caught by ErrorBoundary)",
      });

      return (
        <div className="app">
          <h1>Something went wrong</h1>
          <p className="error">{this.state.error.message}</p>
          <p className="muted">
            The app hit an unexpected error and can't continue safely from here. Reloading usually fixes it.
          </p>
          <div className="field__row">
            <button className="button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <ExternalLink className="button" href={issueUrl}>
              Report this error
            </ExternalLink>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

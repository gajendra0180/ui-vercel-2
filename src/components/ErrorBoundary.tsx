import React, { Component, ErrorInfo, ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env.DEV;

      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <div className="error-icon">⚠️</div>
            <h1>Something Went Wrong</h1>
            <p className="error-message">
              We encountered an unexpected error. Please try reloading the page or return to the home page.
            </p>

            {/* Only show technical details in development */}
            {isDevelopment && (
              <details className="error-details">
                <summary>Error Details (Development Only)</summary>
                <div className="error-details-content">
                  <p className="error-hint">Error Message:</p>
                  <code className="error-code">
                    {this.state.error?.message || "No error message available"}
                  </code>
                  <p className="error-hint" style={{ marginTop: "12px" }}>Stack Trace:</p>
                  <code className="error-code error-stack">
                    {this.state.error?.stack || "No stack trace available"}
                  </code>
                </div>
              </details>
            )}

            <div className="error-actions">
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                🔄 Reload Page
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.location.href = "/"}
              >
                🏠 Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../../styles/ui/ErrorBoundary.css';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.name || 'unnamed'}]`, error, info);
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <AlertTriangle className="error-boundary-icon" />
          <p className="error-boundary-text">
            {this.props.fallback || 'Component failed to render'}
          </p>
          <button
            onClick={this.handleRetry}
            className="error-boundary-retry-btn"
          >
            <RefreshCw className="error-boundary-retry-icon" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

import React from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    this.logErrorToBackend(error, errorInfo);
  }

  async logErrorToBackend(error, errorInfo) {
    try {
      const browserInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        vendor: navigator.vendor
      };

      const screen_resolution = `${window.screen.width}x${window.screen.height}`;
      const viewport_size = `${window.innerWidth}x${window.innerHeight}`;

      await axios.post('/api/audit/frontend-error', {
        error_message: error.toString(),
        error_stack: error.stack,
        error_component: errorInfo.componentStack,
        page_url: window.location.href,
        page_title: document.title,
        component_name: this.props.componentName || 'Unknown',
        browser_info: browserInfo,
        screen_resolution,
        viewport_size,
        metadata: {
          errorInfo: errorInfo.componentStack
        }
      });
    } catch (logError) {
      console.error('Failed to log error to backend:', logError);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          margin: '2rem',
          backgroundColor: '#fff3f3',
          border: '1px solid #ff4444',
          borderRadius: '8px'
        }}>
          <h2 style={{ color: '#d32f2f', marginBottom: '1rem' }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: '1rem' }}>
            An error occurred while rendering this component. The error has been logged and will be reviewed.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>
                Error Details (Development Only)
              </summary>
              <pre style={{
                marginTop: '0.5rem',
                padding: '1rem',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '0.875rem'
              }}>
                {this.state.error && this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  componentName: PropTypes.string
};

ErrorBoundary.defaultProps = {
  componentName: 'Unknown'
};
export default ErrorBoundary;

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught UI rendering error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="m-4 max-w-xl mx-auto rounded-2xl border-2 border-red-400 bg-red-50 p-6 shadow-md text-red-950 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-red-900">
                {this.props.fallbackTitle || 'ያልተጠበቀ ስህተት ተከስቷል (Application Error)'}
              </h2>
              <p className="text-xs text-red-800 leading-relaxed">
                አፑ ሙሉ በሙሉ እንዳይቋረጥ ስህተቱ ተገድቧል። እባክዎ ከታች ያለውን ቁልፍ ተጭነው ዳግም ይሞክሩ።
              </p>
            </div>
          </div>

          {this.state.error?.message && (
            <div className="rounded-xl bg-white border border-red-200 px-3.5 py-2.5 text-xs font-mono text-red-700 break-words">
              {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ዳግም ሞክር (Retry)</span>
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-red-100 text-red-800 border border-red-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <span>ገጹን አድስ (Reload App)</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

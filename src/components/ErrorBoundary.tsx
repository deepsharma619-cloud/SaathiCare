import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  firestoreErrorDetails: Record<string, unknown> | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    firestoreErrorDetails: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    let parsed: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(error.message);
      if (candidate && typeof candidate === 'object' && 'operationType' in candidate) {
        parsed = candidate;
      }
    } catch {
      parsed = null;
    }

    return {
      hasError: true,
      errorMessage: parsed ? String(parsed.error || error.message) : error.message,
      firestoreErrorDetails: parsed,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SaathiCare Uncaught Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#FAF8F5] text-[#1C1917] flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border border-[#E7E2DA] rounded-xl p-8">
            <div className="flex items-center gap-3 text-[#9A3412] mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
              <h1 className="text-2xl font-semibold">Something interrupted your session</h1>
            </div>
            <p className="text-base text-[#57534E] mb-4">
              SaathiCare encountered a database or application error. No unverified changes were saved.
            </p>
            <div className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-sm font-mono text-[#1C1917] mb-6 break-words">
              {this.state.errorMessage}
              {this.state.firestoreErrorDetails && (
                <div className="mt-2 text-xs text-[#57534E]">
                  Operation: {String(this.state.firestoreErrorDetails.operationType)} · Path:{' '}
                  {String(this.state.firestoreErrorDetails.path || 'unknown')}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload Application
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

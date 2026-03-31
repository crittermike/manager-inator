import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-full w-full flex items-center justify-center p-6 bg-zinc-950 text-zinc-100 animate-fade-in">
          <div className="max-w-md w-full bg-surface rounded-2xl border border-border p-8 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-6">
              <AlertTriangle className="w-6 h-6 text-danger" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-400 mb-6">
              An unexpected error occurred in the application rendering process.
            </p>
            
            {this.state.error && (
              <div className="bg-surface-raised border border-border/50 rounded-lg p-4 mb-6 overflow-auto max-h-48">
                <code className="text-xs text-danger font-mono break-words">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-100 hover:bg-white text-zinc-900 font-medium rounded-lg transition-all active:scale-[0.97]"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />
               Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

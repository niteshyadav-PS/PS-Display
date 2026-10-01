import { Component } from 'react'

/**
 * Stops a render error in one page from blanking the whole admin portal.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Something broke on this screen</h2>
          <p className="mt-2 text-sm text-gray-500">
            The rest of the app is still fine. Try reloading, and if it keeps happening send us the
            details below.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-gray-50 p-3 text-left text-[11px] text-gray-600">
            {error.message}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

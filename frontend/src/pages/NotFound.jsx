import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/Logo.png'

export default function NotFound() {
  const { user } = useAuth()
  const location = useLocation()
  const home = user ? '/app/dashboard' : '/login'

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#f3f4f6] p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-7 text-center shadow-sm">
        <img src={logo} alt="Profile Solution" className="mx-auto h-12 w-auto object-contain" />

        <p className="mt-5 text-5xl font-bold tracking-tight text-brand">404</p>
        <h1 className="mt-1 text-lg font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 break-all text-sm text-gray-500">
          We could not find <span className="font-semibold">{location.pathname}</span>.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Link
            to={home}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
          >
            {user ? 'Back to dashboard' : 'Go to sign in'}
          </Link>
          {user ? (
            <Link
              to="/app/displays"
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-brand"
            >
              My Displays
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

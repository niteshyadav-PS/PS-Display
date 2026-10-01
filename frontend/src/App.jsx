import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import AppLayout from './layouts/AppLayout'
import Login from './pages/login'
import ForgotPassword from './pages/forgot-password'
import ResetPassword from './pages/reset-password'
import ContactAdmin from './pages/contact-admin'
import NotFound from './pages/NotFound'

// The editor and dashboard pull in the heaviest dependencies (charts, drag logic),
// so they load on demand instead of blocking first paint of the login screen.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyDisplays = lazy(() => import('./pages/MyDisplays'))
const CreateDisplay = lazy(() => import('./pages/CreateDisplay'))
const DisplayEditor = lazy(() => import('./pages/DisplayEditor'))
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'))
const Settings = lazy(() => import('./pages/Settings'))
const CreateUser = lazy(() => import('./pages/CreateUser'))

const PAGE_TITLES = {
  '/login': 'Sign in',
  '/forgot-password': 'Forgot password',
  '/reset-password': 'Reset password',
  '/contact-admin': 'Contact admin',
  '/app/dashboard': 'Dashboard',
  '/app/displays': 'My Displays',
  '/app/displays/new': 'Create display',
  '/app/media': 'Media library',
  '/app/users': 'Users',
  '/app/settings': 'Settings',
}

function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    let label = PAGE_TITLES[pathname]
    if (!label && /^\/app\/displays\/[^/]+\/edit$/.test(pathname)) label = 'Editor'
    if (!label && pathname !== '/') label = 'Page not found'
    document.title = label ? `${label} · PS Display` : 'PS Display'
  }, [pathname])

  return null
}

function FullScreenLoader({ dark = false }) {
  return (
    <div
      className={`grid min-h-full place-items-center ${
        dark ? 'bg-[#1a1c20] text-white/70' : 'bg-[#f3f4f6] text-gray-500'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        Loading...
      </div>
    </div>
  )
}

function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader dark />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function PublicOnly() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/app/dashboard" replace />
  return <Outlet />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <DocumentTitle />
        <ErrorBoundary>
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/contact-admin" element={<ContactAdmin />} />
              </Route>

              <Route path="/app" element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="displays" element={<MyDisplays />} />
                  <Route path="displays/new" element={<CreateDisplay />} />
                  <Route path="media" element={<MediaLibrary />} />
                  <Route path="users" element={<CreateUser />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="displays/:id/edit" element={<DisplayEditor />} />
              </Route>

              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

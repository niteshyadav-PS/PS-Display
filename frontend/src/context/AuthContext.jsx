import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, getToken, setToken, setUnauthorizedHandler } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // Sign out automatically when the API says our token is no longer valid.
  useEffect(() => {
    setUnauthorizedHandler(() => logout())
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    // No stored token means there is nothing to restore.
    if (!getToken()) {
      setLoading(false)
      return undefined
    }

    let alive = true

    authApi
      .me()
      .then((data) => {
        if (alive) setUser(data.user)
      })
      .catch(() => {
        if (alive) logout()
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [logout])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'Administrator',
      async login(username, password, { remember = true } = {}) {
        const data = await authApi.login(username, password)
        setToken(data.token, { remember })
        setUser(data.user)
        return data.user
      },
      setUser,
      logout,
    }),
    [user, loading, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

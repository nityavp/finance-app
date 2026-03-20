import { useState, useEffect } from 'react'
import Login from './Login'
import Upload from './Upload'
import InstallPrompt from './InstallPrompt'
import './App.css'

function App() {
  const [user, setUser] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('finance_user')
    if (stored) setUser(stored)
  }, [])

  const handleLogin = (email: string) => {
    localStorage.setItem('finance_user', email)
    setUser(email)
  }

  const handleLogout = () => {
    localStorage.removeItem('finance_user')
    setUser(null)
  }

  return (
    <div className="app">
      <InstallPrompt />
      {user ? (
        <Upload user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  )
}

export default App

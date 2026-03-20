import { useState, type FormEvent } from 'react'

const USERS: Record<string, string> = {
  'nitya@valuepitch.com': 'Nitya@2026',
  'rajesh@valuepitch.com': 'vpfintech@@2026',
}

interface Props {
  onLogin: (email: string) => void
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const expected = USERS[email.toLowerCase()]
    if (expected && expected === password) {
      onLogin(email.toLowerCase())
    } else {
      setError('Invalid email or password')
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Finance App</h1>
        <p className="subtitle">Upload documents for processing</p>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="you@company.com"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Enter password"
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">Sign In</button>
        </form>
      </div>
    </div>
  )
}

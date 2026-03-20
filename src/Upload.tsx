import { useState, useRef, type ChangeEvent } from 'react'

const WEBHOOK_URL = 'https://automation.lendingcube.ai/webhook/financeapp'

interface Props {
  user: string
  onLogout: () => void
}

export default function Upload({ user, onLogout }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setStatus(null)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setSending(true)
    setStatus(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('username', user)

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setStatus({ ok: true, msg: 'Uploaded successfully!' })
        setFile(null)
        setPreview(null)
        if (inputRef.current) inputRef.current.value = ''
      } else {
        setStatus({ ok: false, msg: `Upload failed (${res.status})` })
      }
    } catch (err) {
      setStatus({ ok: false, msg: 'Network error. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="upload-container">
      <header>
        <h1>Finance App</h1>
        <div className="user-info">
          <span>{user}</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="upload-card">
        <h2>Upload Image</h2>
        <p className="hint">Select an image to send for processing</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          id="file-input"
        />
        <label htmlFor="file-input" className="file-label">
          {file ? file.name : 'Choose image or take photo'}
        </label>

        {preview && (
          <div className="preview">
            <img src={preview} alt="Preview" />
          </div>
        )}

        <button
          className="upload-btn"
          onClick={handleUpload}
          disabled={!file || sending}
        >
          {sending ? 'Uploading...' : 'Upload'}
        </button>

        {status && (
          <p className={status.ok ? 'success' : 'error'}>{status.msg}</p>
        )}
      </div>
    </div>
  )
}

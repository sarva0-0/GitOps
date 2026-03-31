import { useEffect, useState } from 'react'

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000'

export default function App() {
  const [notes, setNotes] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const load = () => fetch(`${API}/notes`).then(r => r.json()).then(setNotes)

  useEffect(() => { load() }, [])

  const add = async () => {
    await fetch(`${API}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    })
    setTitle(''); setBody(''); load()
  }

  const del = async (id) => {
    await fetch(`${API}/notes/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Notes</h1>
      <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      <input placeholder="Body" value={body} onChange={e => setBody(e.target.value)} />
      <button onClick={add}>Add</button>
      {notes.map(n => (
        <div key={n._id}>
          <strong>{n.title}</strong> — {n.body}
          <button onClick={() => del(n._id)}>delete</button>
        </div>
      ))}
    </div>
  )
}

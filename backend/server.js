const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/notes')

const Note = mongoose.model('Note', { title: String, body: String })

app.get('/notes', async (req, res) => {
  res.json(await Note.find())
})

app.post('/notes', async (req, res) => {
  const note = await Note.create(req.body)
  res.json(note)
})

app.delete('/notes/:id', async (req, res) => {
  await Note.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

app.listen(5000, () => console.log('Backend running on 5000'))

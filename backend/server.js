const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── MongoDB connection ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/statusboard';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected:', MONGO_URI))
  .catch((err) => console.error('MongoDB connection error:', err));

// ── Service model ───────────────────────────────────────────────────────────
const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['operational', 'degraded', 'outage', 'maintenance'],
    default: 'operational',
  },
  note: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Service = mongoose.model('Service', serviceSchema);

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /services — return all services sorted by name
app.get('/services', async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services', details: err.message });
  }
});

// POST /services — create a new service
app.post('/services', async (req, res) => {
  try {
    const { name, status, note } = req.body;
    const service = new Service({ name, status, note });
    await service.save();
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create service', details: err.message });
  }
});

// PATCH /services/:id — update status or note
app.patch('/services/:id', async (req, res) => {
  try {
    const { status, note } = req.body;
    const updates = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (note !== undefined) updates.note = note;

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update service', details: err.message });
  }
});

// DELETE /services/:id — delete a service
app.delete('/services/:id', async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ message: 'Service deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service', details: err.message });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = 5000;
app.listen(PORT, () => console.log(`Status board API running on port ${PORT}`));

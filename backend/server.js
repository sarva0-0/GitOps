const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/deployboard";

mongoose.connect(MONGO_URI).then(() => console.log("MongoDB connected"));

// ── Schema ──────────────────────────────────────────────────────────────────
const deploymentSchema = new mongoose.Schema({
  service:     { type: String, required: true },
  environment: { type: String, enum: ["production", "staging", "dev"], required: true },
  sha:         { type: String, required: true },
  deployer:    { type: String, required: true },
  status:      { type: String, enum: ["success", "failed", "in-progress"], required: true },
  duration:    { type: Number },           // seconds
  branch:      { type: String },
  message:     { type: String },           // commit message
  timestamp:   { type: Date, default: Date.now },
});

const Deployment = mongoose.model("Deployment", deploymentSchema);

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /deployments — called by CI pipeline after each deploy
app.post("/deployments", async (req, res) => {
  try {
    const doc = await Deployment.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /deployments — paginated list with optional filters
app.get("/deployments", async (req, res) => {
  const { service, environment, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (service)     filter.service     = service;
  if (environment) filter.environment = environment;
  if (status)      filter.status      = status;

  const [docs, total] = await Promise.all([
    Deployment.find(filter).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(Number(limit)),
    Deployment.countDocuments(filter),
  ]);
  res.json({ deployments: docs, total, page: Number(page), limit: Number(limit) });
});

// GET /deployments/stats — dashboard summary numbers
app.get("/deployments/stats", async (req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [today, successToday, failedToday, allTime, avgDur, byService] = await Promise.all([
    Deployment.countDocuments({ timestamp: { $gte: dayAgo } }),
    Deployment.countDocuments({ timestamp: { $gte: dayAgo }, status: "success" }),
    Deployment.countDocuments({ timestamp: { $gte: dayAgo }, status: "failed" }),
    Deployment.countDocuments(),
    Deployment.aggregate([{ $group: { _id: null, avg: { $avg: "$duration" } } }]),
    Deployment.aggregate([
      { $group: { _id: "$service", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]),
  ]);

  res.json({
    today,
    successToday,
    failedToday,
    successRate: today > 0 ? Math.round((successToday / today) * 100) : 0,
    allTime,
    avgDuration: avgDur[0] ? Math.round(avgDur[0].avg) : 0,
    busiestService: byService[0]?._id || "—",
  });
});

// GET /services — distinct service names
app.get("/services", async (_req, res) => {
  const services = await Deployment.distinct("service");
  res.json(services);
});

// DELETE /deployments — clear all (useful for demo reset)
app.delete("/deployments", async (_req, res) => {
  await Deployment.deleteMany({});
  res.json({ message: "All deployments cleared" });
});

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(5000, () => console.log("DeployBoard API running on :5000"));

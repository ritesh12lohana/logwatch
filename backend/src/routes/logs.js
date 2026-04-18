const express = require("express");
const router = express.Router();
const logStore = require("../store/logStore");
const alertService = require("../services/alertService");
const { validateLog } = require("../middleware/validateLog");

// POST /api/logs
router.post("/", validateLog, async (req, res) => {
  const { level, message, service, metadata } = req.body;
  const entry = logStore.add({ level, message, service, metadata: metadata || {} });

  if (level === "ERROR" || level === "WARNING") {
    // fire-and-forget — don't block the response waiting on the queue
    alertService.trigger(entry).catch((err) =>
      console.error("alert dispatch error:", err.message)
    );
  }

  res.status(201).json({ success: true, log: entry });
});

// POST /api/logs/batch
router.post("/batch", async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: "logs must be a non-empty array" });
  }

  const saved = [];
  for (const log of logs) {
    if (!log.level || !log.message) continue;

    const entry = logStore.add({
      level: log.level.toUpperCase(),
      message: log.message,
      service: log.service || "unknown",
      metadata: log.metadata || {},
    });

    if (entry.level === "ERROR" || entry.level === "WARNING") {
      alertService.trigger(entry).catch(() => {});
    }

    saved.push(entry);
  }

  res.status(201).json({ success: true, saved: saved.length });
});

// GET /api/logs
router.get("/", (req, res) => {
  const { level, service, from, to, limit } = req.query;
  const logs = logStore.getFiltered({ level, service, from, to, limit });
  res.json({ logs, count: logs.length });
});

// DELETE /api/logs
router.delete("/", (req, res) => {
  logStore.clear();
  res.json({ success: true, message: "logs cleared" });
});

module.exports = router;

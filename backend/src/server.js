const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");

const logRoutes = require("./routes/logs");
const logStore = require("./store/logStore");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    queue: process.env.QUEUE_URL || "http://queue:3001",
  });
});

app.use("/api/logs", logRoutes);

// O(1) stats — counters, not a full array scan
app.get("/api/stats", (req, res) => {
  const stats = logStore.getStats();
  res.json({ ...stats, lastUpdated: new Date().toISOString() });
});

// SSE live stream for the dashboard
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 15000);

  const unsubscribe = logStore.subscribe((log) => {
    res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.listen(PORT, () => {
  console.log(`logwatch backend on port ${PORT}`);
  console.log(`alerts dispatching to ${process.env.QUEUE_URL || "http://queue:3001"}`);
});

module.exports = app;

// queue API — receives alert dispatch requests from logwatch backend
const express = require("express");
const { alertQueue, dlq } = require("./queue");
const config = require("./config");

const app = express();
app.use(express.json());

// health check — also reports queue depth
app.get("/health", async (req, res) => {
  try {
    const waiting = await alertQueue.getWaitingCount();
    const failed = await alertQueue.getFailedCount();
    const dlqSize = await dlq.getWaitingCount();
    res.json({ status: "ok", waiting, failed, dlq: dlqSize });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// dispatched by logwatch alertService when ERROR/WARNING detected
app.post("/alert", async (req, res) => {
  const { level, service, message, timestamp, metadata } = req.body;

  if (!level || !message) {
    return res.status(400).json({ error: "level and message are required" });
  }

  const job = await alertQueue.add(
    "send-alert",
    { level, service, message, timestamp, metadata },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100, // keep last 100 completed jobs for inspection
      removeOnFail: false,   // keep all failed so we can debug
    }
  );

  res.status(202).json({ queued: true, jobId: job.id });
});

// queue status — useful for the dashboard and debugging
app.get("/jobs/stats", async (req, res) => {
  const [waiting, active, completed, failed, dlqSize] = await Promise.all([
    alertQueue.getWaitingCount(),
    alertQueue.getActiveCount(),
    alertQueue.getCompletedCount(),
    alertQueue.getFailedCount(),
    dlq.getWaitingCount(),
  ]);
  res.json({ waiting, active, completed, failed, deadLetter: dlqSize });
});

// list jobs in the dead-letter queue so we can inspect/replay them
app.get("/jobs/failed", async (req, res) => {
  const jobs = await dlq.getJobs(["waiting"], 0, 20);
  res.json({
    count: jobs.length,
    jobs: jobs.map((j) => ({
      id: j.id,
      data: j.data,
      addedAt: new Date(j.timestamp).toISOString(),
    })),
  });
});

// replay a single dead-letter job back into the main queue
app.post("/jobs/failed/:id/replay", async (req, res) => {
  const jobs = await dlq.getJobs(["waiting"]);
  const job = jobs.find((j) => j.id === req.params.id);

  if (!job) return res.status(404).json({ error: "job not found in DLQ" });

  await alertQueue.add("send-alert", job.data, { attempts: 3 });
  await job.remove();

  res.json({ replayed: true });
});

app.listen(config.port, () => {
  console.log(`queue API running on port ${config.port}`);
});

module.exports = app;

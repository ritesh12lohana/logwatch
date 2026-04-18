// alert worker — consumes jobs from the alert queue
const { Worker } = require("bullmq");
const config = require("./config");
const { dlq } = require("./queue");

const worker = new Worker(
  "alerts",
  async (job) => {
    const { level, service, message, timestamp } = job.data;

    // in production: send to Slack, PagerDuty, email, etc.
    // here we log it in a structured way that's easy to grep
    const icon = level === "ERROR" ? "🔴" : "🟡";
    console.log(
      `${icon} [worker] ALERT processed | service=${service} level=${level} | ${message} | ${timestamp}`
    );

    // simulate occasional transient failure to show retry working
    if (process.env.SIMULATE_FAILURES === "true" && Math.random() < 0.1) {
      throw new Error("simulated transient failure");
    }
  },
  {
    connection: config.redis,
    concurrency: 5, // process up to 5 alerts at once
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed (attempt ${job.attemptsMade})`);
});

worker.on("failed", async (job, err) => {
  console.error(`[worker] job ${job.id} failed: ${err.message}`);

  // after all retries exhausted, move to DLQ for inspection/replay
  if (job.attemptsMade >= job.opts.attempts) {
    console.warn(`[worker] moving job ${job.id} to dead-letter queue`);
    await dlq.add("failed-alert", {
      originalJobId: job.id,
      ...job.data,
      failReason: err.message,
      failedAt: new Date().toISOString(),
    });
  }
});

worker.on("error", (err) => {
  console.error("[worker] worker error:", err.message);
});

console.log("[worker] alert worker started, waiting for jobs...");

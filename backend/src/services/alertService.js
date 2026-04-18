const axios = require("axios");

const QUEUE_URL = process.env.QUEUE_URL || "http://queue:3001";

// cooldown so we don't flood the queue with the same alert every 2 seconds
const cooldowns = new Map();
const COOLDOWN_MS = 60 * 1000;

async function trigger(logEntry) {
  const { level, service } = logEntry;

  const key = `${service}-${level}`;
  const last = cooldowns.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return;

  cooldowns.set(key, Date.now());

  // always print locally so backend logs stay useful
  printAlert(logEntry);

  // dispatch to the queue — worker handles the actual delivery
  // if the queue is down we warn but never crash log ingestion
  try {
    await axios.post(
      `${QUEUE_URL}/alert`,
      {
        level: logEntry.level,
        service: logEntry.service,
        message: logEntry.message,
        timestamp: logEntry.timestamp,
        metadata: logEntry.metadata || {},
      },
      { timeout: 3000 }
    );
  } catch (err) {
    console.warn(`[alert] queue unreachable, alert not dispatched: ${err.message}`);
  }
}

function printAlert(entry) {
  const icon = entry.level === "ERROR" ? "🔴" : "🟡";
  console.log(`\n${icon} ${entry.level} in ${entry.service}: ${entry.message}\n`);
}

module.exports = { trigger };

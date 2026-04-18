const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "2000");

// fake services to make it feel realistic
const services = ["auth-service", "payment-service", "user-api", "notification-service", "order-service"];

// pool of realistic log messages
const messages = {
  INFO: [
    "user login successful",
    "payment processed successfully",
    "order created with id #{{id}}",
    "cache refreshed",
    "health check passed",
    "new user registered",
    "email sent to user",
    "session started",
    "config loaded from environment",
  ],
  WARNING: [
    "response time exceeded 500ms",
    "retry attempt {{n}} of 3",
    "memory usage above 80%",
    "rate limit approaching threshold",
    "deprecated endpoint called: /api/v1/old",
    "database connection pool almost full",
  ],
  ERROR: [
    "database connection failed",
    "unhandled exception in request handler",
    "payment gateway timeout",
    "failed to send email: SMTP error",
    "null pointer exception at line {{n}}",
    "authentication token expired",
    "disk write failed: no space left",
  ],
  DEBUG: [
    "query executed in {{n}}ms",
    "request body parsed",
    "middleware chain complete",
    "cache miss for key user:{{id}}",
  ],
};

// weighted random — mostly INFO, occasional errors
function pickLevel() {
  const rand = Math.random();
  if (rand < 0.60) return "INFO";
  if (rand < 0.80) return "WARNING";
  if (rand < 0.95) return "ERROR";
  return "DEBUG";
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessage(level) {
  const template = pickRandom(messages[level]);
  return template
    .replace("{{id}}", Math.floor(Math.random() * 9000 + 1000))
    .replace("{{n}}", Math.floor(Math.random() * 100 + 1));
}

async function sendLog() {
  const level = pickLevel();
  const service = pickRandom(services);
  const message = buildMessage(level);

  const payload = {
    level,
    service,
    message,
    metadata: {
      host: `server-${Math.floor(Math.random() * 3 + 1)}`,
      pid: process.pid,
    },
  };

  try {
    await axios.post(`${BACKEND_URL}/api/logs`, payload);
    console.log(`[${level}] ${service} → ${message}`);
  } catch (err) {
    console.error("could not reach backend:", err.message);
  }
}

console.log(`logwatch producer started — sending logs every ${INTERVAL_MS}ms to ${BACKEND_URL}`);

// fire one immediately then keep going
sendLog();
setInterval(sendLog, INTERVAL_MS);

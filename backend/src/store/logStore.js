const { v4: uuidv4 } = require("uuid");

const MAX_LOGS = 1000;

let logs = [];
let subscribers = [];

// counters updated on every insert — O(1) stats, no full scan needed
const counters = { total: 0, INFO: 0, WARNING: 0, ERROR: 0, DEBUG: 0 };

function add(logEntry) {
  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...logEntry,
  };

  logs.push(entry);
  counters.total++;
  if (counters[entry.level] !== undefined) counters[entry.level]++;

  // evict oldest when over capacity, keep counters accurate
  if (logs.length > MAX_LOGS) {
    const removed = logs.shift();
    counters.total--;
    if (counters[removed.level] !== undefined) counters[removed.level]--;
  }

  subscribers.forEach((cb) => cb(entry));
  return entry;
}

function getAll() {
  return [...logs];
}

function getFiltered({ level, service, from, to, limit = 100 }) {
  let result = [...logs];

  if (level) result = result.filter((l) => l.level === level.toUpperCase());
  if (service) result = result.filter((l) => l.service === service);
  if (from) result = result.filter((l) => new Date(l.timestamp) >= new Date(from));
  if (to) result = result.filter((l) => new Date(l.timestamp) <= new Date(to));

  result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return result.slice(0, parseInt(limit));
}

// O(1) — no array scan, just the running counters
function getStats() {
  return { ...counters };
}

function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((cb) => cb !== callback);
  };
}

function clear() {
  logs = [];
  Object.keys(counters).forEach((k) => (counters[k] = 0));
}

module.exports = { add, getAll, getFiltered, getStats, subscribe, clear };

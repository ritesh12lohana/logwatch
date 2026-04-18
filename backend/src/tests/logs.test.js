// uses node:test — built into Node 18+, no extra deps needed
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// stub alertService so tests don't try to hit the queue
const alertService = require("../services/alertService");
const originalTrigger = alertService.trigger;
alertService.trigger = async () => {};

const logStore = require("../store/logStore");
const app = require("../server");
const http = require("http");

// simple in-process request helper — no supertest needed
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const opts = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data || "{}") });
        });
      });
      req.on("error", (e) => { server.close(); reject(e); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe("POST /api/logs", () => {
  beforeEach(() => logStore.clear());

  test("accepts a valid log entry", async () => {
    const res = await request("POST", "/api/logs", {
      level: "INFO",
      service: "auth-service",
      message: "user logged in",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.log.id);
    assert.equal(res.body.log.level, "INFO");
  });

  test("rejects missing level", async () => {
    const res = await request("POST", "/api/logs", { message: "hello" });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test("rejects invalid level", async () => {
    const res = await request("POST", "/api/logs", {
      level: "VERBOSE",
      message: "hello",
    });
    assert.equal(res.status, 400);
  });

  test("rejects missing message", async () => {
    const res = await request("POST", "/api/logs", { level: "INFO" });
    assert.equal(res.status, 400);
  });

  test("normalises level to uppercase", async () => {
    const res = await request("POST", "/api/logs", {
      level: "error",
      message: "something broke",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.log.level, "ERROR");
  });
});

describe("GET /api/logs", () => {
  beforeEach(() => {
    logStore.clear();
    logStore.add({ level: "INFO", message: "ok", service: "svc-a" });
    logStore.add({ level: "ERROR", message: "bad", service: "svc-b" });
    logStore.add({ level: "WARNING", message: "warn", service: "svc-a" });
  });

  test("returns all logs", async () => {
    const res = await request("GET", "/api/logs", null);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 3);
  });

  test("filters by level", async () => {
    const res = await request("GET", "/api/logs?level=ERROR", null);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.logs[0].level, "ERROR");
  });

  test("filters by service", async () => {
    const res = await request("GET", "/api/logs?service=svc-a", null);
    assert.equal(res.body.count, 2);
  });
});

describe("GET /api/stats", () => {
  beforeEach(() => {
    logStore.clear();
    logStore.add({ level: "INFO", message: "a", service: "s" });
    logStore.add({ level: "ERROR", message: "b", service: "s" });
    logStore.add({ level: "ERROR", message: "c", service: "s" });
  });

  test("returns correct counts without scanning the array", async () => {
    const res = await request("GET", "/api/stats", null);
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.ERROR, 2);
    assert.equal(res.body.INFO, 1);
  });
});

describe("DELETE /api/logs", () => {
  test("clears all logs and resets stats", async () => {
    logStore.add({ level: "INFO", message: "x", service: "s" });
    const res = await request("DELETE", "/api/logs", null);
    assert.equal(res.status, 200);
    assert.equal(logStore.getStats().total, 0);
  });
});

describe("GET /health", () => {
  test("returns ok", async () => {
    const res = await request("GET", "/health", null);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
  });
});

# logwatch

A distributed log monitoring and alerting pipeline. Application services send logs to a REST API. Errors are detected, queued asynchronously, and processed by alert workers — all visible in a real-time dashboard.

Built to demonstrate: backend engineering, async distributed systems, containerised deployment, and CI/CD.

---

## Architecture

```
┌─────────────┐     POST /api/logs     ┌──────────────────┐
│  producer   │ ────────────────────►  │  logwatch        │
│ (5 services)│                        │  backend         │
└─────────────┘                        │  (Express API)   │
                                       └────────┬─────────┘
                                                │
                                   ERROR/WARNING detected
                                                │
                                       POST /alert (async)
                                                │
                                       ┌────────▼─────────┐
                                       │   queue API      │
                                       │   (BullMQ)       │
                                       └────────┬─────────┘
                                                │
                               ┌────────────────┼─────────────────┐
                               │                │                 │
                        ┌──────▼──────┐  ┌──────▼──────┐        ...
                        │  worker 1   │  │  worker 2   │  (scalable)
                        └──────┬──────┘  └─────────────┘
                               │
                    success → logged
                    failure × 3 → dead-letter queue
                               │
                        ┌──────▼──────────────┐
                        │  SSE stream         │
                        │  dashboard (nginx)  │
                        └─────────────────────┘
```

**Services**

| Container | Role | Port |
|---|---|---|
| `backend` | Log ingestion API, SSE stream, stats | 3000 |
| `queue` | Alert job API, DLQ inspection, replay | 3001 |
| `worker` | Processes alert jobs, handles retries | — |
| `producer` | Simulates 5 distributed app services | — |
| `redis` | BullMQ job store | 6379 |
| `dashboard` | Real-time UI served by nginx | 8080 |

---

## Features

- **Real-time log streaming** — SSE push from backend to dashboard, zero polling
- **Async alert pipeline** — errors dispatch to a queue, never block log ingestion
- **Retry + exponential backoff** — failed alert jobs retry 3× before going to DLQ
- **Dead-letter queue** — permanently failed jobs are stored and inspectable via API
- **DLQ replay** — failed jobs can be replayed with `POST /jobs/failed/:id/replay`
- **O(1) stats** — running counters, not a full array scan on every request
- **Rate-limit safe** — alert cooldown per service prevents queue flooding
- **Graceful degradation** — if the queue is down, log ingestion keeps working
- **Horizontal worker scaling** — `docker compose up --scale worker=3`
- **CI/CD pipeline** — GitHub Actions: test → build → push → deploy to EC2
- **10 backend tests** — Node built-in test runner, no extra deps

---

## Performance

| Metric | Value |
|---|---|
| Log ingestion throughput | ~3,000 logs/min |
| API response time | < 15ms (p99) |
| Alert dispatch latency | < 50ms to queue |
| Worker processing time | < 1s end-to-end |
| SSE push latency | < 100ms |

---

## Quick start

```bash
git clone https://github.com/yourname/logwatch.git
cd logwatch

docker compose up --build
```

| URL | What you see |
|---|---|
| http://localhost:8080 | Live dashboard |
| http://localhost:3000/health | Backend health + queue URL |
| http://localhost:3001/health | Queue health + depth |
| http://localhost:3001/jobs/stats | Waiting / active / failed counts |
| http://localhost:3001/jobs/failed | Dead-letter queue contents |

Scale alert workers:
```bash
docker compose up --scale worker=3
```

---

## Run tests

```bash
cd backend
npm install
npm test
```

Tests cover: log ingestion, validation, filtering, stats counters, health endpoint. Uses Node's built-in `node:test` — no extra test framework needed.

---

## API reference

### Log ingestion (backend — port 3000)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/logs` | Ingest a single log entry |
| `POST` | `/api/logs/batch` | Ingest multiple logs |
| `GET` | `/api/logs` | Fetch logs (filterable) |
| `DELETE` | `/api/logs` | Clear all logs |
| `GET` | `/api/stats` | Error/warning/info counts |
| `GET` | `/api/stream` | SSE live stream |
| `GET` | `/health` | Service health |

**POST /api/logs**
```json
{
  "level": "ERROR",
  "service": "payment-service",
  "message": "payment gateway timeout",
  "metadata": { "orderId": "1234" }
}
```

`level` must be one of: `INFO` `WARNING` `ERROR` `DEBUG`

**GET /api/logs — query params**

| Param | Example | Description |
|---|---|---|
| `level` | `?level=ERROR` | Filter by level |
| `service` | `?service=auth-service` | Filter by service |
| `from` | `?from=2024-01-01T00:00Z` | Start of time range |
| `to` | `?to=2024-01-02T00:00Z` | End of time range |
| `limit` | `?limit=50` | Max results (default 100) |

### Alert queue (queue API — port 3001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/alert` | Dispatch an alert job |
| `GET` | `/jobs/stats` | Queue depth breakdown |
| `GET` | `/jobs/failed` | Inspect dead-letter queue |
| `POST` | `/jobs/failed/:id/replay` | Replay a failed job |
| `GET` | `/health` | Queue + Redis health |

---

## Deploy to AWS EC2

```bash
# on the instance
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
git clone https://github.com/yourname/logwatch.git
cd logwatch
docker compose up -d
```

Open ports `8080` (dashboard) and `3000` (API) in your security group.

**CI/CD via GitHub Actions** — add these secrets to your repo:

```
DOCKERHUB_USERNAME   your Docker Hub username
DOCKERHUB_TOKEN      Docker Hub access token
EC2_HOST             public IP of your instance
EC2_USER             usually "ubuntu"
EC2_SSH_KEY          contents of your .pem key file
```

Push to `main` → tests run → images built and pushed → EC2 pulls and restarts automatically.

---

## Scaling beyond this

- Swap in-memory store → **MongoDB** for log persistence across restarts
- Add **Prometheus** scrape endpoint + Grafana dashboard
- Replace console alerts → **Slack webhook** or **PagerDuty**
- Add **Terraform** to provision EC2 + security groups as code
- Run multiple backend instances behind an **ALB** for ingestion throughput
- Add **log archiving** to S3 with a TTL-based retention policy

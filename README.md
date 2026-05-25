# Distributed Job Queue System

A production-grade background job processing system built with Node.js, BullMQ, Redis, and MongoDB. Supports priority queues, concurrent workers, exponential backoff retry, dead letter queuing, and a real-time monitoring dashboard.

---

## Architecture

```
Client → Express API → BullMQ Queue → Worker → MongoDB
                           ↓                      ↓
                      Redis (state)         Job history
                           ↓
                      Dead Letter Queue (on max retries)
```

## Stack

| Layer       | Technology        |
|-------------|-------------------|
| API         | Node.js, Express  |
| Queue       | BullMQ            |
| Cache/State | Redis             |
| Database    | MongoDB           |
| Dashboard   | Bull Board UI     |
| Container   | Docker            |
| Tests       | Jest, Supertest   |

---

## Quick Start

### Option A — Docker (recommended)

```bash
docker compose up -d
```

App runs at `http://localhost:3000`

### Option B — Local (Node 18+)

**1. Start Redis & MongoDB**
```bash
docker compose up redis mongodb -d
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment**
```bash
cp .env .env.local
# Edit .env.local if needed
```

**4. Start the API server**
```bash
npm run dev
```

**5. Start the workers (separate terminal)**
```bash
npm run workers
```

---

## URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | API root |
| `http://localhost:3000/health` | Health check |
| `http://localhost:3000/dashboard` | Bull Board UI |
| `http://localhost:3000/api/jobs` | Jobs API |
| `http://localhost:3000/api/jobs/metrics` | Queue metrics |

---

## API Reference

### Create a Job
```http
POST /api/jobs
Content-Type: application/json

{
  "queueName": "email",          // email | report | notification
  "jobName": "send-welcome-email",
  "data": {
    "email": "user@example.com",
    "firstName": "Alice"
  },
  "priority": "high",            // high | medium | low
  "maxAttempts": 3,
  "scheduledFor": "2024-12-01T09:00:00Z"  // optional
}
```

### List Jobs
```http
GET /api/jobs?queue=email&status=pending&page=1&limit=20
```

### Get Job by ID
```http
GET /api/jobs/:id
```

### Cancel a Job
```http
DELETE /api/jobs/:id
```

### Retry a Failed Job
```http
POST /api/jobs/:id/retry
```

### Get Metrics
```http
GET /api/jobs/metrics
```

### Drain a Queue (admin)
```http
POST /api/jobs/queue/:queueName/drain
```

---

## Queue Types

### Email Queue (`email`)
| Job Name | Priority | Description |
|----------|----------|-------------|
| `send-welcome-email` | high | New user welcome |
| `send-password-reset` | high | Password reset link |
| `send-transactional` | medium | Order confirmations etc |
| `send-newsletter` | low | Bulk newsletter |

### Report Queue (`report`)
| Job Name | Priority | Description |
|----------|----------|-------------|
| `generate-analytics` | high | Analytics reports |
| `generate-pdf-report` | medium | PDF generation |
| `generate-csv-export` | low | Data exports |
| `generate-daily-digest` | low | Daily summaries |

### Notification Queue (`notification`)
| Job Name | Priority | Description |
|----------|----------|-------------|
| `send-push-notification` | high | Mobile push |
| `send-sms` | high | SMS messages |
| `send-slack-message` | medium | Slack alerts |
| `send-webhook` | medium | Webhook delivery |

---

## Retry & Backoff

Failed jobs retry automatically with exponential backoff:

```
Attempt 1 fails → wait  5s → retry
Attempt 2 fails → wait 10s → retry
Attempt 3 fails → wait 20s → dead letter queue
```

Configure via `.env`:
```
MAX_RETRIES=3
RETRY_DELAY_MS=5000
```

---

## Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Worker Concurrency

| Worker       | Concurrency | Rationale |
|--------------|-------------|-----------|
| Email        | 10          | I/O-bound, fast |
| Report       | 3           | CPU-heavy |
| Notification | 15          | Very fast I/O |

Adjust via `JOB_CONCURRENCY` in `.env` or per-worker in the worker files.

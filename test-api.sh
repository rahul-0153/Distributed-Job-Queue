#!/bin/bash

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0
JOB_ID=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
section() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }

check() {
  local label=$1
  local expected=$2
  local actual=$3
  if echo "$actual" | grep -q "$expected"; then
    pass "$label"
  else
    fail "$label (expected: '$expected', got: '$actual')"
  fi
}

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}   Distributed Job Queue — API Test Suite   ${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Target: ${YELLOW}$BASE_URL${NC}"

# ── 1. Health ────────────────────────────────────────────────────────────────
section "1. Health Check"
RES=$(curl -s "$BASE_URL/health")
check "Returns 200 with status ok"  '"status":"ok"'  "$RES"
check "Has uptime field"            '"uptime"'        "$RES"
check "Has timestamp"               '"timestamp"'     "$RES"

# ── 2. Root ──────────────────────────────────────────────────────────────────
section "2. API Root"
RES=$(curl -s "$BASE_URL/")
check "Lists dashboard endpoint"   '"dashboard"'   "$RES"
check "Lists jobs endpoint"        '"jobs"'        "$RES"
check "Lists metrics endpoint"     '"metrics"'     "$RES"

# ── 3. Create Jobs ───────────────────────────────────────────────────────────
section "3. Create Jobs"

# Email job (high priority)
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"email","jobName":"send-welcome-email","data":{"email":"alice@example.com","firstName":"Alice","userId":"u_001"},"priority":"high"}')
check "Create email job (high priority)"  '"success":true'          "$RES"
check "Returns job id"                    '"id"'                    "$RES"
check "Queue is email"                    '"queue":"email"'         "$RES"
JOB_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "  ${YELLOW}→ Captured job id: $JOB_ID${NC}"

# Report job (medium priority)
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"report","jobName":"generate-pdf-report","data":{"reportType":"sales","dateRange":"2024-Q4"},"priority":"medium"}')
check "Create report job (medium priority)"  '"success":true'  "$RES"
check "Queue is report"                      '"queue":"report"' "$RES"

# Notification job (low priority)
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"notification","jobName":"send-push-notification","data":{"userId":"u_001","deviceToken":"tok_abc123","title":"Hello","body":"Your report is ready"},"priority":"low"}')
check "Create notification job (low priority)"  '"success":true'          "$RES"
check "Queue is notification"                   '"queue":"notification"'  "$RES"

# SMS job
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"notification","jobName":"send-sms","data":{"phoneNumber":"+1234567890","message":"Your OTP is 884921"},"priority":"high"}')
check "Create SMS notification job"  '"success":true'  "$RES"

# Scheduled job (1 minute from now)
FUTURE=$(date -u -d "+1 minute" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v+1M '+%Y-%m-%dT%H:%M:%SZ')
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"queueName\":\"email\",\"jobName\":\"send-newsletter\",\"data\":{\"recipients\":[\"a@b.com\",\"c@d.com\"],\"subject\":\"Weekly Digest\",\"content\":\"Hello!\"},\"priority\":\"low\",\"scheduledFor\":\"$FUTURE\"}")
check "Create scheduled email job"  '"success":true'  "$RES"

# ── 4. Validation ────────────────────────────────────────────────────────────
section "4. Validation (should reject bad input)"

RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"jobName":"test","data":{}}')
check "Rejects missing queueName"   '"success":false'      "$RES"
check "Returns validation details"  '"Validation failed"'  "$RES"

RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"hacker-queue","jobName":"test","data":{}}')
check "Rejects invalid queue name"  '"success":false'  "$RES"

RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"email","jobName":"test","data":{},"priority":"ultra"}')
check "Rejects invalid priority"  '"success":false'  "$RES"

RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"email","data":{}}')
check "Rejects missing jobName"  '"success":false'  "$RES"

# ── 5. List Jobs ─────────────────────────────────────────────────────────────
section "5. List & Filter Jobs"

RES=$(curl -s "$BASE_URL/api/jobs")
check "Returns job list"        '"success":true'   "$RES"
check "Has pagination object"   '"pagination"'     "$RES"
check "Has total count"         '"total"'          "$RES"

RES=$(curl -s "$BASE_URL/api/jobs?queue=email")
check "Filter by queue=email"   '"success":true'  "$RES"

RES=$(curl -s "$BASE_URL/api/jobs?status=pending")
check "Filter by status=pending"  '"success":true'  "$RES"

RES=$(curl -s "$BASE_URL/api/jobs?priority=high")
check "Filter by priority=high"   '"success":true'  "$RES"

RES=$(curl -s "$BASE_URL/api/jobs?page=1&limit=2")
check "Pagination (limit=2)"  '"success":true'  "$RES"

RES=$(curl -s "$BASE_URL/api/jobs?sortBy=createdAt&order=asc")
check "Sort ascending"  '"success":true'  "$RES"

# ── 6. Get Single Job ────────────────────────────────────────────────────────
section "6. Get Single Job"

if [ -n "$JOB_ID" ]; then
  RES=$(curl -s "$BASE_URL/api/jobs/$JOB_ID")
  check "Fetch job by id"         '"success":true'  "$RES"
  check "Has logs array"          '"logs"'          "$RES"
  check "Has attempts field"      '"attempts"'      "$RES"
  check "Has queueName field"     '"queueName"'     "$RES"
else
  fail "Skipped — no job id captured"
fi

RES=$(curl -s "$BASE_URL/api/jobs/nonexistent-id-999")
check "Returns 404 for unknown id"  '"success":false'  "$RES"

# ── 7. Metrics ───────────────────────────────────────────────────────────────
section "7. Queue Metrics"

RES=$(curl -s "$BASE_URL/api/jobs/metrics")
check "Metrics endpoint responds"     '"success":true'      "$RES"
check "Has summary object"            '"summary"'           "$RES"
check "Has byQueue breakdown"         '"byQueue"'           "$RES"
check "Has liveQueueCounts"           '"liveQueueCounts"'   "$RES"
check "Summary has total"             '"total"'             "$RES"
check "Summary has successRate"       '"successRate"'       "$RES"
check "byQueue has email section"     '"email"'             "$RES"
check "byQueue has report section"    '"report"'            "$RES"
check "byQueue has notification"      '"notification"'      "$RES"

# ── 8. Retry Endpoint ────────────────────────────────────────────────────────
section "8. Retry a Non-Failed Job (should reject)"

if [ -n "$JOB_ID" ]; then
  RES=$(curl -s -X POST "$BASE_URL/api/jobs/$JOB_ID/retry")
  check "Rejects retry on non-failed job"  '"success":false'  "$RES"
else
  fail "Skipped — no job id captured"
fi

# ── 9. Cancel Job ────────────────────────────────────────────────────────────
section "9. Cancel a Job"

# Create a delayed job to cancel (delay keeps it in pending so worker can't grab it)
RES=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"report","jobName":"generate-csv-export","data":{"entity":"users"},"priority":"low","delay":60000}')
CANCEL_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$CANCEL_ID" ]; then
  RES=$(curl -s -X DELETE "$BASE_URL/api/jobs/$CANCEL_ID")
  check "Cancel job returns success"  '"success":true'  "$RES"
else
  fail "Skipped — could not create job to cancel"
fi

RES=$(curl -s -X DELETE "$BASE_URL/api/jobs/nonexistent-999")
check "Cancel unknown job returns 404"  '"success":false'  "$RES"

# ── 10. Drain Queue ──────────────────────────────────────────────────────────
section "10. Drain Queue (admin)"

RES=$(curl -s -X POST "$BASE_URL/api/jobs/queue/email/drain")
check "Drain email queue"  '"success":true'  "$RES"

RES=$(curl -s -X POST "$BASE_URL/api/jobs/queue/bad-queue/drain")
check "Rejects invalid queue for drain"  '"success":false'  "$RES"

# ── 11. 404 Handler ──────────────────────────────────────────────────────────
section "11. 404 Handler"

RES=$(curl -s "$BASE_URL/api/nonexistent")
check "Unknown route returns 404"  '"success":false'  "$RES"

RES=$(curl -s "$BASE_URL/totally-wrong")
check "Wrong path returns 404"  '"success":false'  "$RES"

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}All $TOTAL tests passed ✓${NC}"
else
  echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  (total: $TOTAL)"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
echo -e "  ${CYAN}Bull Board dashboard → $BASE_URL/dashboard${NC}\n"
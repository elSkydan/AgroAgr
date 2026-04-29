# Business Logic — Lead Distribution System (Production-Hardened)

## 1. Worker Assignment — Replaced Round-Robin

**Old approach:** `current_worker_index` on `cities` table — fragile under concurrency,
requires locking the city row on every assignment.

**New approach:** sort eligible workers by recency, pick the least-recently-used.

```sql
SELECT w.id, w.telegram_chat_id
FROM   workers w
WHERE  w.city_id   = $1
AND    w.is_active = TRUE
AND    w.id NOT IN (
         -- skip workers already tried for this lead
         SELECT worker_id FROM lead_assignments WHERE lead_id = $2
       )
ORDER BY
  w.priority         DESC,   -- higher priority first
  w.last_assigned_at ASC NULLS FIRST  -- NULL = never assigned → top of queue
LIMIT 1;
```

No `current_worker_index` column needed. The `cities` table no longer needs
to be locked during assignment.

---

## 2. Race Condition Protection

Every mutation that changes lead status runs inside a single transaction:

```
BEGIN;

  -- 1. Lock the lead row (blocks concurrent accept/reject/timeout)
  SELECT id, status, worker_id
  FROM   leads
  WHERE  id = $lead_id
  FOR UPDATE;

  -- 2. Validate the transition (see §4 Lifecycle)
  --    If status has already changed → ROLLBACK, return HTTP 409

  -- 3. Apply the mutation (UPDATE leads, INSERT lead_assignments, etc.)

  -- 4. Update workers.last_assigned_at (no city lock needed anymore)

COMMIT;
```

`cities` no longer needs `FOR UPDATE` since we dropped `current_worker_index`.

---

## 3. Timeout Cron Job (`timeoutService.js`)

Runs every minute via `node-cron` (`* * * * *`).

```sql
-- Find timed-out "assigned" leads; SKIP LOCKED avoids blocking the cron
-- if a previous run is still processing
SELECT id
FROM   leads
WHERE  status     = 'assigned'
AND    updated_at < NOW() - ($1 * INTERVAL '1 minute')  -- e.g. 3 minutes
FOR UPDATE SKIP LOCKED;
```

For each result:

1. Insert `lead_assignments (lead_id, worker_id, status='timeout')` for the current worker.
2. Run the assignment query from §1 to find the next eligible worker.
3. **If found:** set `leads.status = 'assigned'`, send Telegram message to next worker.
4. **If not found:** set `leads.status = 'unassigned'`, notify admin via Telegram.

### Accepted-TTL (`failed_contact`)

A separate cron check (can run in the same job):

```sql
SELECT id
FROM   leads
WHERE  status     = 'accepted'
AND    updated_at < NOW() - ($1 * INTERVAL '1 minute')  -- e.g. 30 minutes
FOR UPDATE SKIP LOCKED;
```

→ Set `status = 'failed_contact'`, notify admin.

---

## 4. Lead Lifecycle — Strict State Machine

```
new ──→ assigned ──→ accepted ──→ completed
             │            │
             ↓            └──→ failed_contact (accepted TTL expired)
          rejected
             │
             └──→ [reassigned = back to assigned with next worker]
             
        timeout ──→ [reassigned = back to assigned with next worker]
        
        any ──→ canceled     (admin action only)
        any ──→ unassigned   (no workers available)
```

**Allowed transitions table** (enforce in `assignmentService.js`):

| From           | To               | Trigger               |
|----------------|------------------|-----------------------|
| new            | assigned         | lead created          |
| assigned       | accepted         | worker Telegram tap   |
| assigned       | rejected         | worker Telegram tap   |
| assigned       | timeout          | cron job              |
| rejected       | assigned         | reassignment          |
| timeout        | assigned         | reassignment          |
| accepted       | completed        | worker/admin action   |
| accepted       | failed_contact   | cron job (TTL)        |
| *              | canceled         | admin only            |
| *              | unassigned       | no workers left       |

Any other transition → throw `{ code: 'INVALID_TRANSITION', statusCode: 409 }`.

---

## 5. Anti-Spam

### Phone normalization

```js
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  // Already has country code (12 digits starting with 380)
  if (digits.length === 12 && digits.startsWith('380')) return '+' + digits;
  // 10-digit local number (0XX...)
  if (digits.length === 10 && digits.startsWith('0'))   return '+38' + digits;
  // 11-digit with leading 8 (old RU-style, rare)
  if (digits.length === 11 && digits.startsWith('80'))  return '+3' + digits;
  throw Object.assign(new Error('Cannot normalize phone: ' + raw), { statusCode: 422 });
}
```

### Duplicate window (10 minutes)

```sql
SELECT id, status
FROM   leads
WHERE  phone_normalized = $1
AND    created_at       > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

| Existing status           | Action                                        |
|---------------------------|-----------------------------------------------|
| `new` or `assigned`       | UPDATE existing lead (area, service, price)   |
| `completed` or `canceled` | INSERT new lead (fresh order allowed)         |
| anything else             | INSERT new lead                               |

### Rate limit

`express-rate-limit` on `POST /leads`:
- Window: 60 seconds
- Max: 5 requests per IP
- Response on exceed: `HTTP 429` with `Retry-After` header

---

## 6. Telegram Security

### Outbound message (to worker)

```js
// callback_data must be a JSON string ≤ 64 bytes
const callbackData = JSON.stringify({
  l: lead_id,   // short keys to stay within 64 bytes
  w: worker_id,
  a: 'accept'   // or 'reject'
});
```

### Inbound callback validation (`telegram.js` route)

```js
async function handleCallback(callbackQuery) {
  const { lead_id, worker_id, action } = JSON.parse(callbackQuery.data);
  const telegramChatId = callbackQuery.from.id;

  // 1. Verify the worker owns this chat_id
  const worker = await db.query(
    'SELECT id FROM workers WHERE id = $1 AND telegram_chat_id = $2',
    [worker_id, telegramChatId]
  );
  if (!worker.rows.length) return answerCallback('Not authorized');

  // 2. Run the transition inside a transaction (§2 Race Condition Protection)
  //    Checks that lead.status === 'assigned' AND lead.worker_id === worker_id
  //    before applying the transition.
}
```

---

## 7. Edge Cases

| Scenario                              | Handling                                      |
|---------------------------------------|-----------------------------------------------|
| No active workers in city             | `status = unassigned`, Telegram → admin       |
| All workers rejected / timed out      | `status = unassigned`, Telegram → admin       |
| Worker already tried (in assignments) | Skipped by NOT IN subquery (§1)               |
| Worker deactivated mid-flow           | Cron timeout fires → picks next active worker |
| Duplicate lead same phone < 10 min   | UPDATE existing, no new row                   |
| `accepted` lead goes silent 30 min    | Cron → `failed_contact`, Telegram → admin     |
| Admin cancels any lead                | Direct UPDATE, bypasses state machine check   |
| Invalid area / service type           | `pricingService` throws 422 before DB write   |

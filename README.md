# Lead Distribution — Setup & Run

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Create the database

```bash
createdb lead_distribution
psql lead_distribution < db/schema.sql
```

---

## 3. Configure environment

```bash
cp .env .env
```

Edit `.env` and set at minimum:

```
DATABASE_URL=postgres://user:password@localhost:5432/lead_distribution
TELEGRAM_BOT_TOKEN=your-token
ADMIN_CHAT_ID=your-chat-id
ADMIN_TOKEN=any-secret-string
```

---

## 4. Seed a test city and worker (optional)

```sql
INSERT INTO cities (name, delivery_type, delivery_price)
VALUES ('Kyiv', 'fixed', 200);

INSERT INTO workers (name, phone, telegram_chat_id, city_id, equipment_type)
VALUES ('Ivan Testov', '+380671234567', 123456789, 1, 'motoblock');
```

---

## 5. Start the server

```bash
npm start
# or with auto-restart on file changes (Node 18+):
npm run dev
```

Server starts at: http://localhost:3000

Health check: `GET /health`

---

## 6. Test POST /api/leads

### Minimal valid request

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Taras Shevchenko",
    "phone": "0671234567",
    "service_type": "ogorod",
    "area": 2,
    "city_id": 1,
    "out_of_city": false
  }'
```

### Expected response (201)

```json
{
  "lead_id": 1,
  "total_price": 1700,
  "status": "assigned",
  "assigned": true,
  "message": "Lead received. A specialist will contact you shortly."
}
```

### Celina, out of city

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0671234568",
    "service_type": "celina",
    "area": 5,
    "city_id": 1,
    "out_of_city": true
  }'
```

Expected price: `5 * 600 + 200 (delivery) = 3200`

### Validation error (missing phone)

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"service_type": "ogorod", "area": 2, "city_id": 1}'
```

### Get lead (admin)

```bash
curl http://localhost:3000/api/leads/1 \
  -H "Authorization: Bearer your-admin-token"
```

### Cancel lead (admin)

```bash
curl -X PATCH http://localhost:3000/api/leads/1/cancel \
  -H "Authorization: Bearer your-admin-token"
```

---

## File layout

```
/
├── server.js               # Entry point
├── package.json
├── .env.example
├── config/
│   └── config.js
├── db/
│   ├── schema.sql
│   └── pool.js
└── server/
    ├── routes/
    │   └── leads.js
    ├── services/
    │   ├── assignmentService.js
    │   ├── pricingService.js
    │   ├── telegramService.js
    │   └── timeoutService.js
    └── middlewares/
        ├── auth.js
        ├── rateLimiter.js
        └── validateLead.js
```

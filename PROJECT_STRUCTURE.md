# Project Structure — Production-Ready MVP

```
/
├── client/                         # Frontend (static)
│   ├── index.html                  # Lead submission form
│   ├── admin.html                  # Admin dashboard
│   ├── calc.js                     # UI price preview (mirrors server logic, display only)
│   └── style.css
│
├── server/
│   ├── main.js                      # Express app factory (no listen here)
│   ├── server.js                   # Entry point: app.listen + graceful shutdown
│   │
│   ├── controllers/
│   │   ├── leadController.js       # POST /leads, GET /leads/:id, PATCH /leads/:id/cancel
│   │   ├── workerController.js     # CRUD workers (admin)
│   │   └── cityController.js       # CRUD cities + delivery config (admin)
│   │
│   ├── services/
│   │   ├── assignmentService.js    # Worker selection + assignment transaction
│   │   ├── pricingService.js       # calcPrice() — server is single source of truth
│   │   ├── telegramService.js      # Send messages + parse callback_data
│   │   └── timeoutService.js       # Cron: reassign timed-out / stale leads
│   │
│   ├── routes/
│   │   ├── leads.js                # Public: POST /leads
│   │   ├── admin.js                # Protected: workers, cities, lead management
│   │   └── telegram.js             # POST /webhook (Telegram callback)
│   │
│   └── middlewares/
│       ├── rateLimiter.js          # 5 req/min/IP on POST /leads
│       ├── validateLead.js         # Input validation + phone normalization
│       └── auth.js                 # Admin Bearer token check
│
├── db/
│   ├── schema.sql                  # Full CREATE TABLE (source of truth)
│   ├── seed.sql                    # Dev seed data
│   ├── pool.js                     # pg Pool singleton
│   └── migrations/                 # Versioned migration files (e.g. 001_init.sql)
│
├── config/
│   ├── config.js                   # All tunable constants (exported, not .env raw)
│   └── .env.example                # Template — never commit .env
│
├── .env                            # DB_URL, TELEGRAM_TOKEN, ADMIN_TOKEN (git-ignored)
├── package.json
└── .gitignore
```

## Key decisions

- `main.js` vs `server.js` split — makes integration testing possible without binding a port.
- `admin.js` route merges workers + cities under one auth-protected router (cleaner than 3 separate route files for MVP).
- `config/config.js` centralises all magic numbers: `TIMEOUT_MINUTES`, `SPAM_WINDOW_MINUTES`, `RATE_LIMIT_MAX`, `ACCEPTED_TTL_MINUTES`. No hardcoded values inside services.
- No repository/DAO layer — direct `pool.query()` inside services is acceptable for this scale. Add a `db/` query-helper module only if query count grows beyond ~30 unique queries.

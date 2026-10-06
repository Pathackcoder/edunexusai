# EdunexusAI student portal

| Part | Path | Port |
| --- | --- | --- |
| React + Vite frontend | `frontend/` | 5173 |
| Express + Prisma API | `backend/` | 5001 (`/api-docs` for Swagger) |
| Mock external university API (SIS/LMS fixtures) | `mock-external-service/` | 5002 |
| PostgreSQL 18.4 (DBngin server "EdunexusAI") | database `edunexusai` | 5432 |

## First run

```bash
cd backend && cp .env.example .env      # then set JWT secrets
createdb -h 127.0.0.1 -p 5432 -U postgres edunexusai   # or create it in TablePlus
npm install && npm run db:setup         # migrations + demo seed
cd ../frontend && npm install
cd .. && ./scripts/dev.sh start         # mock API, backend, frontend
```

Demo accounts: `student@edunexus.ai` / `student.advanced@edunexus.ai` (`Student@Demo2026!`),
`faculty@edunexus.ai` (`Faculty@Demo2026!`), `admin@edunexus.ai` (`Admin@Demo2026!`).

See [docs/database-and-workflows.md](docs/database-and-workflows.md) for the schema, data classification,
request/notification workflows, advanced features and a demo walkthrough.

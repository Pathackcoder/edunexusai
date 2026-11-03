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

Academic records come live from CampusCore SIS. Students and faculty are onboarded from their CampusCore record
under Users & Roles → Add user (login, CampusCore link and Moodle account together; see
[docs/campuscore-integration.md](docs/campuscore-integration.md)). Passwords are always stored as bcrypt hashes, and
administrator-issued passwords must be changed at first sign-in.

See [docs/database-and-workflows.md](docs/database-and-workflows.md) for the schema, data classification,
request/notification workflows, advanced features and a demo walkthrough.

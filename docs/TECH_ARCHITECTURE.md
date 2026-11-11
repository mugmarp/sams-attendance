# Technical Architecture & Tool Connections — Group B E-tivity 5

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEVELOPMENT ENVIRONMENT                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  VS Code │    │   Git    │    │ GitHub   │    │  Node.js │              │
│  │  Editor  │◄───│  Local   │───►│  Remote  │    │  Runtime │              │
│  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘              │
│        │           │                │                 │                    │
│        │           │                │                 │                    │
│        ▼           ▼                ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                    EXPRESS APPLICATION                            │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐             │      │
│  │  │ Routes  │──│Controllers│──│ Services│──│  Models │             │      │
│  │  └─────────┘  └─────────┘  └─────────┘  └────┬────┘             │      │
│  │                                               │                   │      │
│  │                    ┌──────────────────────────┘                   │      │
│  │                    ▼                                               │      │
│  │            ┌───────────────┐                                      │      │
│  │            │  Database     │                                      │      │
│  │            │  (MongoDB/    │                                      │      │
│  │            │   PostgreSQL) │                                      │      │
│  │            └───────────────┘                                      │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│        │                    │                    │                         │
│        ▼                    ▼                    ▼                         │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐                  │
│  │ Postman  │         │ Frontend │         │  GitHub  │                  │
│  │  Tests   │         │ (React/  │         │ Actions  │                  │
│  │          │         │  Vue/    │         │   (CI)   │                  │
│  └──────────┘         └──────────┘         └──────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tool-by-Tool Breakdown

### 1. **Node.js + Express** — The Backbone
| Aspect | Details |
|--------|---------|
| **Role** | HTTP server, routing, middleware, API endpoints |
| **Version** | Node 20+ LTS (check: `node -v`) |
| **Entry point** | `server.js` or `app.js` |
| **Key packages** | `express`, `cors`, `helmet`, `morgan`, `dotenv`, `joi`/`zod` (validation) |

**How it connects:**
- Reads config from `.env` (DB URL, port, JWT secret)
- Imports routes → controllers → services → models
- Models talk to database driver (Mongoose / pg / Prisma)
- Exposes REST endpoints on `http://localhost:3000/api/*`

---

### 2. **Database** — Persistent Storage
| Option | When to Use | Driver/ORM |
|--------|-------------|------------|
| **MongoDB + Mongoose** | Flexible schema, rapid prototyping, JSON-like data | `mongoose` |
| **PostgreSQL + Prisma** | Relational data, complex queries, type safety | `@prisma/client` |
| **PostgreSQL + pg** | Raw SQL control, simple needs | `pg` |

**Connection flow:**
```
.env → DATABASE_URL → config/db.js → Model files → Services → Controllers
```

**Critical:** Never commit `.env` — use `.env.example` for template.

---

### 3. **Postman** — API Testing & Documentation
| Use Case | How |
|----------|-----|
| **Manual testing** | Send requests, inspect responses |
| **Automated tests** | `pm.test()` scripts in collection |
| **CI integration** | `newman run collection.json` in GitHub Actions |
| **Documentation** | Publish collection → public docs page |
| **Mock server** | Frontend devs can work before backend ready |

**Collection structure:**
```
Group B E-tivity 5/
├── Auth/
│   ├── POST /login
│   └── POST /register
├── Students/
│   ├── GET /students
│   ├── GET /students/:id
│   ├── POST /students
│   ├── PUT /students/:id
│   └── DELETE /students/:id
└── Courses/...
```

**Each request needs:**
- Pre-request script (set auth token)
- Tests (status code, response schema, timing)
- Examples (save response as example)

---

### 4. **Frontend** — User Interface
| Option | Best For | Connects Via |
|--------|----------|--------------|
| **React + Vite** | Team knows React, component library | `fetch` / `axios` / TanStack Query |
| **Vue 3 + Vite** | Simpler learning curve | `axios` / Pinia |
| **Vanilla JS + Vite** | Minimal, learning focus | `fetch` API |
| **Next.js** | SSR/SEO needed, full-stack | API routes + Express (or replace Express) |

**Connection pattern:**
```
Frontend (port 5173) → API calls → Express (port 3000)
     │                        │
     │              CORS middleware
     ▼                        ▼
Proxy in vite.config.js   Access-Control-Allow-Origin
```

**Vite proxy (dev only):**
```js
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

---

### 5. **Git + GitHub** — Version Control & Collaboration
| Layer | Tool | Purpose |
|-------|------|---------|
| Local | `git` | Commit, branch, merge locally |
| Remote | GitHub | Push, PR, review, CI, issues |
| CI | GitHub Actions | Lint, test, build on every PR |

**Branch protection (required):**
- `main` — protected, requires PR + 1 approval + CI pass
- No direct pushes to main

---

### 6. **GitHub Actions** — CI/CD (Optional but Recommended)
```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

---

## Data Flow — Request to Response

```
1. Browser/Postman
      │
      ▼
2. HTTP Request (GET /api/students?page=1)
      │
      ▼
3. Express: middleware chain
   - helmet (security headers)
   - cors (cross-origin)
   - morgan (logging)
   - express.json() (body parse)
      │
      ▼
4. Router: matches /api/students → studentsRouter
      │
      ▼
5. Controller: studentsController.getAll(req, res, next)
   - validates query params (joi/zod)
   - calls service
      │
      ▼
6. Service: studentService.findAll({ page, limit })
   - business logic
   - calls model
      │
      ▼
7. Model: Student.find().paginate()
   - database query
      │
      ▼
8. Database returns data
      │
      ▼
9. Response flows back up: Model → Service → Controller
      │
      ▼
10. Controller: res.json({ data, meta: { page, total } })
      │
      ▼
11. Client receives JSON
```

---

## Common Confusions & Solutions

| Confusion | Reality | Solution |
|-----------|---------|----------|
| **"Where does the database live?"** | Local (Docker) or cloud (MongoDB Atlas, Supabase, Neon) | Use `.env` for connection string; same code works for both |
| **"Frontend can't call backend — CORS error"** | Browser blocks cross-origin by default | Add `cors()` middleware in Express **before** routes |
| **"My changes don't show in Postman"** | Postman caches / old server running | Restart server (`npm run dev`), check port |
| **"git push rejected — non-fast-forward"** | Main moved while you worked | `git pull origin main` → resolve → push |
| **"Merge conflict in package-lock.json"** | Two people added deps | `git checkout -- package-lock.json` → `npm install` |
| **"Environment variables undefined"** | `.env` not loaded | `require('dotenv').config()` **at very top** of entry file |
| **"Validation not working"** | Middleware order wrong | Validation middleware **after** `express.json()`, **before** controller |
| **"Async errors crash server"** | Uncaught promise rejections | Wrap async controllers: `try/catch` or `express-async-errors` package |
| **"Tests pass locally, fail in CI"** | Different Node version / missing env | Pin Node in `.nvmrc` + GitHub Actions; use GitHub secrets for env |

---

## Recommended Project Structure

```
group-b-etivity-5/
├── .github/
│   └── workflows/ci.yml
├── .vscode/
│   └── settings.json
├── docs/
│   └── api.md
├── postman/
│   └── Group_B_Etivity_5.postman_collection.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── env.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   └── studentController.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── validation.js
│   │   │   └── errorHandler.js
│   │   ├── models/
│   │   │   ├── Student.js
│   │   │   └── User.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   └── studentRoutes.js
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   └── studentService.js
│   │   ├── utils/
│   │   │   ├── ApiError.js
│   │   │   └── catchAsync.js
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
├── frontend/ (separate repo or subfolder)
│   ├── src/
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Setup Checklist (Do in Order)

- [ ] **Node 20+ installed** — `node -v`
- [ ] **Repo cloned** — `git clone https://github.com/mugmarp/Group_B_Etivity_5_WEB`
- [ ] **Backend scaffolded** — `cd backend && npm init -y && npm i express cors helmet morgan dotenv joi`
- [ ] **Dev deps** — `npm i -D nodemon eslint prettier`
- [ ] **`.env.example` created** — copy to `.env`, fill values
- [ ] **Database chosen & connected** — test with `npm run dev`
- [ ] **First route works** — `GET /api/health` returns `{ status: 'ok' }`
- [ ] **Postman collection started** — import, add health check
- [ ] **GitHub Actions CI added** — lint + test on PR
- [ ] **Branch protection enabled** — Settings → Branches
- [ ] **Frontend scaffolded** — `npm create vite@latest frontend -- --template react`
- [ ] **Proxy configured** — `vite.config.js` points to backend
- [ ] **Team practices PR flow** — dummy PR, review, merge, conflict resolve

---

## Key Principles for This Project

1. **API first** — design endpoints in Postman before coding
2. **Validation everywhere** — never trust client input
3. **Consistent responses** — `{ success: true, data: ..., meta: ... }` or `{ success: false, error: { code, message } }`
4. **Small commits, clear messages** — `feat:`, `fix:`, `docs:`, `refactor:`
5. **Main is sacred** — never break it; revert fast if needed
6. **Document as you go** — update Postman examples, README, `docs/api.md`

---

## Resources

| Topic | Link |
|-------|------|
| Express routing guide | https://expressjs.com/en/guide/routing.html |
| Mongoose docs | https://mongoosejs.com/docs/ |
| Prisma docs | https://www.prisma.io/docs/ |
| Postman testing | https://learning.postman.com/docs/writing-scripts/test-scripts/ |
| GitHub Actions | https://docs.github.com/en/actions |
| Conventional commits | https://www.conventionalcommits.org/ |
| REST API design | https://restfulapi.net/ |
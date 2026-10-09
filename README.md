<div align="center">

# PriceWatch

**Multi-tenant competitive price intelligence for Tunisian e-commerce**

Distributed scraping · cross-site product matching · real-time price events · agentic RAG assistant · LLM-generated reports

[![Tests](https://github.com/AhmedAzizBENAYED/pricewatch/actions/workflows/tests.yml/badge.svg)](https://github.com/AhmedAzizBENAYED/pricewatch/actions/workflows/tests.yml)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Celery](https://img.shields.io/badge/Celery-5.5-37814A?logo=celery&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![LangGraph](https://img.shields.io/badge/LangGraph-agentic%20RAG-1C3C3C)
![Kubernetes](https://img.shields.io/badge/Kubernetes-k3d%20%2B%20KEDA-326CE5?logo=kubernetes&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-scraping-2EAD33?logo=playwright&logoColor=white)

</div>

---

## Overview

Tunisian retailers such as Mytek, Spacenet, Tunisianet, Carrefour and Géant change prices and promotions almost every day. Two kinds of businesses need to keep up with that:

- **E-commerce sites** need to compare their prices with direct competitors across catalogues of thousands of products.
- **Brands** (Samsung, Lenovo, …) sell through many resellers and need to see how their products are priced and positioned on each channel.

**PriceWatch** is a B2B SaaS platform that handles the whole data chain: it **collects** product pages from 9 retail sites, **normalizes** brands and technical specs, **matches** the same physical product across sites, **detects** price and stock events, and serves the results in a **multi-tenant portal** with role- and plan-based access, analytics, alerts, an AI assistant and generated reports.

> Final-year engineering project (PFE). I designed and built the backend, data pipeline, matching engine, AI features, frontend and infrastructure.

---

## Demo

Each persona gets a different view of the same data. Click a preview to watch the video walkthrough.

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://drive.google.com/file/d/107Vm9ZilbaHrg3fAJsiu93iXwlCmcXcw/view"><img src="docs/demo/admin.jpg" alt="Admin back-office demo"></a>
      <p align="center"><b>▶ Platform admin</b><br><sub>Tenants and plans, sources, scraper runs, match review queue, audit log</sub></p>
    </td>
    <td width="50%" valign="top">
      <a href="https://drive.google.com/file/d/17ZUS-fdg2Zd9axvYZKKSEBnu7wk2K5pV/view"><img src="docs/demo/manager.jpg" alt="Manager executive dashboard demo"></a>
      <p align="center"><b>▶ Manager</b><br><sub>Executive dashboard, competitive pressure index, positioning, reports</sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://drive.google.com/file/d/1ipOeLMI2U5iw1bWqj0a-gUb8P_Z2__Vb/view"><img src="docs/demo/marketing-lead.jpg" alt="Marketing lead demo with AI assistant"></a>
      <p align="center"><b>▶ Marketing lead</b><br><sub>Positioning, report generation, AI assistant, alert rules, monitoring scope</sub></p>
    </td>
    <td width="50%" valign="top">
      <a href="https://drive.google.com/file/d/15GtkbPdTLCdbFyGjzUATC9Pgd9bxf_m1/view"><img src="docs/demo/marketing-team.jpg" alt="Marketing team demo"></a>
      <p align="center"><b>▶ Marketing team</b><br><sub>Product catalogue, cross-site price comparison, price history, events, alerts</sub></p>
    </td>
  </tr>
</table>

---

## Key features

| Area | What it does |
|---|---|
| **Distributed scraping** | A three-stage Celery pipeline (homepage → categories → products) runs on queue-specialized workers. A headless Playwright service pools browsers, and FlareSolverr gets past Cloudflare challenges. 9 sites are supported through per-site parsers. |
| **Normalization** | Brand extraction, category assignment and spec normalization (units, synonyms, canonical keys) run inline in the pipeline, so offers can be compared across sites. |
| **Cross-site matching** | A precision-first 4-stage cascade: blocking → pgvector semantic pre-filter → 4-signal scoring → calibrated decision with a margin gate. An optional LLM judge handles ambiguous pairs, and a human review queue covers the rest. |
| **Price history & events** | Snapshots are stored compactly (consecutive identical observations are merged). Six event types are detected automatically: price drop/increase, promotion start, out of stock, back in stock, and new offer. |
| **Alerting** | Tenants define alert rules (event type × categories × period). Matching events fan out into per-user notifications. |
| **Competitive analytics** | Price positioning against competitors, category and competitor breakdowns, market activity, a category × site heatmap, and trends. |
| **AI assistant** | A LangGraph agent that combines *Adaptive RAG*, *Corrective RAG* and *Self-RAG*. It uses tenant-scoped SQL tools and hybrid document search (pgvector + PostgreSQL full-text, fused with RRF), streams answers over SSE, and keeps conversation memory. |
| **Report generation** | A LangGraph workflow plans the report, collects data through a ReAct tool loop, analyzes it, writes each section, and renders a **PDF** (ReportLab) or **Excel** (openpyxl) file using Pydantic-validated structured output. |
| **Multi-tenancy & RBAC** | Data is isolated per tenant through assigned categories. There are 2 client profiles × 3 roles × 3 subscription plans, enforced in both the API and the UI. |
| **Back-office** | Admin console for tenants, users, sources, brands, categories, scraper runs (launch, retry, cancel), match review, platform statistics and an audit log. |
| **Platform** | Kubernetes (k3d) with Traefik ingress, KEDA autoscaling on Redis queue depth, an HPA on the browser service, Prometheus and Grafana dashboards, Flower, and a Jenkins CI/CD pipeline. |

---

## Architecture

```mermaid
flowchart LR
    U([Browser]) --> T[Traefik Ingress]
    T -->|app.pfe.local| FE[React SPA<br/>nginx]
    T -->|api.pfe.local| API[FastAPI<br/>REST + SSE]

    API --> PG[(PostgreSQL 16<br/>+ pgvector)]
    API -->|enqueue| R[(Redis<br/>broker / state)]
    API -. LLM calls .-> OL[Ollama<br/>qwen3 · nomic-embed]

    R --> WP[worker-pipeline<br/>orchestration · normalization<br/>reports · beat]
    R --> WC[worker-categories<br/>KEDA 1→4]
    R --> WPR[worker-products<br/>KEDA 1→4]

    WC & WPR --> PW[Playwright service<br/>browser pool · HPA 2→6]
    PW --> FS[FlareSolverr]
    PW --> SITES{{9 Tunisian<br/>retail sites}}

    WP & WC & WPR --> PG
    WP -. reports .-> OL

    PROM[Prometheus] --> API
    KEDA[KEDA] --> R
    GRAF[Grafana] --> PROM
    GRAF --> PG
```

**Kubernetes namespaces:** `pfe-infra` (PostgreSQL, Redis) · `pfe-app` (API, frontend, workers, Playwright, FlareSolverr, Flower) · `monitoring` (Prometheus, Grafana, KEDA).

### Scraping & event pipeline

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin / API
    participant P as worker-pipeline
    participant C as worker-categories
    participant W as worker-products
    participant B as Playwright service
    participant DB as PostgreSQL

    A->>P: launch_pipeline(site)
    P->>B: scrape homepage
    B-->>P: category tree
    P->>C: fan-out scrape_category × N
    C->>B: render listing pages
    C->>W: fan-out scrape_product × M (deduplicated in a Redis set)
    W->>B: render product page
    W->>W: normalize (brand, category, specs)
    W->>DB: upsert offer + snapshot
    W->>DB: compare with previous snapshot → create event
    W->>DB: evaluate tenant alert rules → notifications
    P->>P: watchdog (every 30 s) closes stalled / finished runs
```

Each run can be cancelled through a Redis flag that every task checks. URLs are deduplicated with a Redis set, so the same product is only scraped once per run. A periodic watchdog uses the last task activity to detect runs that have finished or stalled.

### Product matching engine

The same product appears on each site under a different name, with different spec formats and different categories. The matcher groups offers under a canonical **referential** product, and it favours **precision over recall**: an uncertain match goes to review instead of being accepted automatically.

```mermaid
flowchart LR
    O[Unmatched offer] --> S1[1 · Blocking<br/>same brand +<br/>compatible sub-category]
    S1 --> S2[2 · Semantic pre-filter<br/>top-15 by cosine<br/>pgvector · nomic-embed]
    S2 --> S3[3 · Fine scoring<br/>model 0.40 · specs 0.25<br/>semantic 0.20 · name 0.15<br/>− hard-spec conflict penalties]
    S3 --> S4{4 · Calibrated decision}
    S4 -->|score ≥ auto<br/>and margin ≥ gate<br/>and cosine ≥ floor| AUTO[AUTO match]
    S4 -->|ambiguous| LLM[LLM judge<br/>valid / uncertain / rejected]
    S4 -->|low score| NM[No match]
    LLM --> REV[Human review queue<br/>back-office]
```

Thresholds are tuned **per product family** (computing, phones, appliances, …) in [`scripts/matching/category_profiles.py`](scripts/matching/category_profiles.py). The margin gate (the best candidate must beat the runner-up by a set amount) and the semantic floor turn ambiguous automatic matches into review items. Families with few technical attributes rely more on semantic and name signals.

### AI assistant: Adaptive + Corrective + Self-RAG

```mermaid
flowchart TD
    Q[User question] --> AQ[analyze_query<br/>rewrite + intent]
    AQ --> RT{router}
    RT -->|small talk / general| DA[direct_answer]
    RT -->|live data| DB[db_agent<br/>tenant-scoped SQL tools]
    RT -->|documents| RD[retrieve_docs<br/>hybrid: pgvector + FTS → RRF]
    RD --> GD{grade_docs}
    GD -->|relevant| GEN[generate]
    GD -->|insufficient| DB
    DB --> GEN
    GEN --> GA{grade_answer<br/>grounded? useful?}
    GA -->|hallucination| GEN
    GA -->|off-target| AQ
    GA -->|ok| MEM[update_memory]
    DA --> MEM
    MEM --> OUT([SSE stream to UI])
```

- **Tools** (all scoped to the caller's tenant and profile): `get_market_overview`, `get_recent_events`, `get_positioning_summary`, `search_products`, `get_competitor_activity`, `get_stock_ruptures`, `search_documents`.
- **Documents:** tenants upload PDF and DOCX files, which are chunked (512 / 64 overlap), embedded with `nomic-embed-text` and indexed in pgvector plus a French full-text GIN index.
- **Local LLM:** runs on Ollama (`qwen3:4b`), so no data leaves the infrastructure. `<think>` blocks are filtered out of the SSE stream, and tracing is available through LangSmith.

### Report generation

`plan_report → react_collect → analyze → write_sections → render`, with an error-handling node that marks the report as failed. The ReAct loop is written by hand (`bind_tools` with explicit tool execution) instead of using `create_react_agent`, because the small local model batches every tool call into one turn, and the prebuilt agent lost intermediate tool results when streaming. Every LLM output is validated against Pydantic schemas before rendering.

---

## Multi-tenancy & access control

Every tenant query is filtered through the tenant's **assigned categories** (`tenant_categories`), and the tenant ID comes from the JWT rather than from the request. Two client profiles change how the analytics are framed:

| Profile | Monitors | Example |
|---|---|---|
| `SITE_ECOMMERCE` | Its own site against competitor sites | Mytek, Spacenet |
| `MARQUE` (brand) | Its own brand across every reseller | Samsung, Lenovo |

Access is the combination of **role × plan**:

| Feature | Roles | Minimum plan |
|---|---|---|
| Dashboard, catalogue, product & offer detail, events, alerts, profile | All | BASIC |
| Alert rules, monitoring scope (self-service categories) | Marketing lead | BASIC |
| Price positioning, reports | Manager, Marketing lead | MEDIUM |
| Market analysis, AI assistant | Manager, Marketing lead | PREMIUM |

Roles: `MANAGER` (strategic view) · `RESP_MARKETING` (full access) · `EQUIPE_MARKETING` (operational). Platform administrators use a separate back-office.

---

## Tech stack

| Layer | Technologies |
|---|---|
| **API** | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic (36 migrations), python-jose (JWT), bcrypt, SSE (sse-starlette) |
| **Async processing** | Celery 5 (3 queues + beat), Redis 7 |
| **Scraping** | Node.js + Express + Playwright (browser pool), FlareSolverr |
| **Data** | PostgreSQL 16, pgvector, JSONB specs, full-text search (French) |
| **AI / ML** | LangGraph, LangChain, Ollama (qwen3:4b, nomic-embed-text), RapidFuzz, NumPy, LangSmith |
| **Reports** | ReportLab (PDF), openpyxl (Excel) |
| **Frontend** | React 18, Vite, React Router, TanStack Query, Zustand, Axios, custom design system plus SVG charts, Tailwind (back-office) |
| **Infrastructure** | Docker, Kubernetes (k3d), Traefik, KEDA, HPA, Prometheus, Grafana, Flower, Jenkins |

---

## Repository structure

```text
.
├── src/
│   ├── api/                 # FastAPI app: routers (admin/, tenant/), schemas, auth deps
│   ├── scraper/             # Celery scraping pipeline, Playwright client, per-site scrapers
│   ├── normalizer/          # Brand extraction, category assignment, spec normalization
│   ├── worker/              # Celery app, alert processor, report graph (LangGraph)
│   ├── ai/                  # RAG agent: graph (nodes/edges/state), tools, retrieval, memory
│   └── common/              # SQLAlchemy models and DB session
├── playwright-service/      # Node.js headless rendering service and site parsers
├── frontend/                # React SPA: tenant portal + admin back-office
├── alembic/                 # Database migrations
├── scripts/
│   ├── matching/            # Offline matching pipeline (embeddings + cascade matcher)
│   ├── seed_db.py           # Seeds the 9 source sites
│   ├── create_admin.py      # Creates the first back-office administrator
│   └── seed_alert_rules.py  # Default alert rules per tenant
├── docker/                  # Dockerfiles (api, worker, frontend, test) + nginx config
├── k8s/
│   ├── base/                # Manifests: infra, apps, KEDA ScaledObjects, HPA, monitoring
│   └── secrets.example/     # Secret templates (real secrets are git-ignored)
├── tests/                   # Unit + integration tests (pytest)
├── .github/workflows/       # GitHub Actions: tests on every push
├── ci/                      # Jenkinsfile + Jenkins image
├── docs/demo/               # README demo previews
└── docker-compose.yml       # Full local stack
```

---

## Getting started

### Prerequisites

- Docker (with Docker Compose v2)
- Python 3.13 (for migrations and scripts)
- [Ollama](https://ollama.com) on the host, only needed for the AI assistant, report generation and LLM-assisted matching:
  ```bash
  ollama pull qwen3:4b-instruct-2507-q4_K_M
  ollama pull qwen3:4b
  ollama pull nomic-embed-text
  ```
- For the Kubernetes setup: [k3d](https://k3d.io) and `kubectl`

### Option A: Docker Compose (quickest)

```bash
git clone https://github.com/AhmedAzizBENAYED/pricewatch.git
cd pricewatch

cp .env.example .env
# Set JWT_SECRET_KEY in .env (the API refuses to start without it):
#   openssl rand -hex 32

docker compose up -d --build
```

Create the schema, seed the source sites and create an administrator:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-api.txt

export POSTGRES_HOST=localhost                       # Windows: set POSTGRES_HOST=localhost
alembic upgrade head
python scripts/seed_db.py
python scripts/create_admin.py --email admin@example.com --name "Admin"
```

| Service | URL |
|---|---|
| Web app (tenant portal and `/admin`) | http://localhost:8080 |
| API + interactive OpenAPI docs | http://localhost:8000/docs |
| Flower (Celery monitoring) | http://localhost:5555 |
| Playwright service health | http://localhost:3001/health |

Sign in to the back-office at `/admin/login`, create a tenant with its users and assigned categories, then start a scraping run from **Scrapers** or through the API:

```bash
curl -X POST http://localhost:8000/api/v1/admin/scrapers/launch \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"site_id": "mytek"}'
```

Available site IDs: `mytek`, `spacenet`, `tunisianet`, `carrefour`, `aziza`, `geant-tunis-city`, `geant-azur-city`, `geant-bourgo-mall`, `geant-sfax`.

**Frontend development with hot reload:** `cd frontend && npm install && npm run dev`. The Vite dev server forwards `/api` to `http://localhost:8000` (set `VITE_API_PROXY` to change the target).

### Option B: Kubernetes (k3d)

```bash
# 1. Cluster with Traefik exposed on :8888
k3d cluster create pfe-cluster --port "8888:80@loadbalancer" --agents 1

# 2. Build the images and import them into the cluster
docker build -f docker/Dockerfile-api      -t pfe-api:latest .
docker build -f docker/Dockerfile-worker   -t pfe-worker:latest .
docker build -f docker/Dockerfile-frontend -t pfe-frontend:latest .
docker build -t pfe-playwright:latest ./playwright-service
k3d image import pfe-api:latest pfe-worker:latest pfe-frontend:latest pfe-playwright:latest -c pfe-cluster

# 3. Namespaces, then secrets (copy the templates and fill in real values)
kubectl apply -f k8s/base/namespaces/
cp -r k8s/secrets.example k8s/secrets     # git-ignored
kubectl apply -f k8s/secrets/

# 4. Workloads
for d in postgres redis api worker flaresolverr playwright flower frontend; do
  kubectl apply -f k8s/base/$d/
done
```

Add `127.0.0.1 api.pfe.local app.pfe.local` to your hosts file, then open http://app.pfe.local:8888. Run the migrations and seed scripts through a port-forward (`kubectl port-forward -n pfe-infra svc/postgres 5432:5432`), as in Option A. `scripts/port-forward.ps1` opens every useful port-forward at once (Windows).

**Autoscaling:** the worker ScaledObjects need [KEDA](https://keda.sh), and the dashboards in `k8s/base/monitoring/` need the `kube-prometheus-stack` Helm chart (values in `values-monitoring.yaml`).

**CI/CD:** [`ci/Jenkinsfile`](ci/Jenkinsfile) first runs the test suite as a quality gate (unit tests, then integration tests against a disposable PostgreSQL + pgvector container). Only if they pass does it build the four images, import them into k3d, apply the manifests and perform rolling restarts. `ci/jenkins/` contains a Jenkins image with Docker, kubectl and k3d preinstalled. The same tests also run on every push through [GitHub Actions](.github/workflows/tests.yml).

### Running the matching pipeline

Matching runs as an offline batch job against the database:

```bash
pip install -r requirements-matching.txt
export DATABASE_URL=postgresql://pfe_user:changeme@localhost:5432/pfe_db

# Embeddings, then the 4-stage cascade, with the LLM judge, writing results to the DB
python scripts/matching/run_full_matching.py --all --llm --write-db
```

Per-bucket CSV exports (`auto`, `llm_valide`, `review`, `no_match`, …) are written to `data/` for auditing.

### Running the tests

```bash
pip install -r requirements-dev.txt

# Unit tests: no services needed
pytest -m "not integration"

# Integration tests: need a throwaway PostgreSQL + pgvector database
docker run -d --rm -p 55432:5432 -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=pricewatch_test pgvector/pgvector:pg16
TEST_DATABASE=1 POSTGRES_HOST=localhost POSTGRES_PORT=55432 POSTGRES_USER=test \
  POSTGRES_PASSWORD=test POSTGRES_DB=pricewatch_test pytest -m integration
```

| Suite | What it protects |
|---|---|
| Event detection | The 6 price/stock event types, the 2 % price threshold, priority rules, resilience when alerting fails |
| Access control | JWT validation (forged, expired, malformed tokens), inactive users, role checks, plan gating, tenant scoping |
| Agentic RAG flow | Adaptive routing, the CRAG fallback to the database agent, the Self-RAG retry loop and its iteration cap, RRF fusion |
| Matching | Unit/format normalization (`8 Go` = `8GB`), hard-spec conflict and capacity penalties, the conservative default profile |
| Normalization | Brand extraction from spec sheets and product names, per-site spec-key mapping, model extraction |
| Database (integration) | All 36 migrations build a fresh database whose schema matches the models; tenants see only their assigned categories |

---

## Configuration

| Variable | Used by | Description |
|---|---|---|
| `POSTGRES_HOST` / `PORT` / `DB` / `USER` / `PASSWORD` | API, workers | Database connection |
| `REDIS_HOST` / `REDIS_PORT` | API, workers | Celery broker, result backend and pipeline state |
| `JWT_SECRET_KEY` | API | **Required.** HS256 signing key; the API fails fast if it is unset or left at the default |
| `ALLOWED_ORIGINS` | API | Comma-separated CORS origins |
| `PLAYWRIGHT_SERVICE_URL` | Workers | Rendering service endpoint |
| `FLARESOLVERR_URL` | Playwright service | Cloudflare solver endpoint |
| `OLLAMA_BASE_URL` | API, workers | Ollama endpoint for the LLMs and embeddings |
| `EMBED_MODEL` | API, matching | Embedding model (default `nomic-embed-text:latest`) |
| `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` / `LANGCHAIN_PROJECT` | API | Optional LangSmith tracing |

See [`.env.example`](.env.example) and [`k8s/secrets.example/`](k8s/secrets.example/).

---

## API

All endpoints are versioned under `/api/v1` and documented with OpenAPI at `/docs`.

| Group | Main endpoints |
|---|---|
| Auth | `POST /auth/login` · `GET /auth/me` |
| Admin | `/admin/tenants` · `/admin/scrapers` (launch, retry, cancel, stats) · `/admin/matching` · `/admin/sources` · `/admin/brands` · `/admin/categories` · `/admin/stats` · `/admin/audit` |
| Catalogue | `/products` · `/products/{id}/comparison` · `/products/{id}/history` · `/offers/{id}` · `/offers/{id}/history` · `/categories` · `/brands` |
| Monitoring | `/dashboard/overview` · `/events` · `/events/summary` · `/alerts` (inbox) · `/alert-rules` (CRUD) · `/scope` |
| Analytics | `/analysis/positioning` (+ `/categories`, `/competitors`) · `/market/activity` · `/market/heatmap` · `/market/trends` |
| AI | `/assistant/conversations` · `POST /assistant/conversations/{id}/messages` (SSE) · `/assistant/documents` · `/reports` |
| Ops | `GET /health` · `GET /metrics` (Prometheus) |

---

## Engineering highlights

- **Tenant isolation without duplicating data:** offers are stored once and scraped once. Isolation comes from a category-assignment join applied in every tenant query and every AI tool, with the tenant ID read from the JWT.
- **Precision-first matching:** a wrong automatic match damages user trust more than a missed one does. Margin and semantic-floor gates send ambiguous pairs to an LLM judge and then to a human review queue.
- **Idempotent, cancellable distributed scraping:** Redis-set deduplication, cooperative cancellation flags, an activity-based watchdog, soft time limits, and queues sized separately (and autoscaled by KEDA) for fan-out stages with very different costs.
- **Compact price history:** a snapshot is only written when the observed state changes; repeated identical observations increment a counter. History stays small while every transition is kept.
- **Agentic RAG with a small local model:** routing, document grading and answer grading let a 4B-parameter model running on Ollama answer reliably from live data. A hand-written ReAct loop works around tool-batching quirks of small models.
- **Secure by default:** bcrypt password hashing, JWT authentication with server-side role and plan checks, fail-fast on default secrets, an audit log of admin actions, a CORS allow-list, and secrets kept out of version control.

---

## Roadmap

- End-to-end UI tests (Playwright) and API endpoint tests, on top of the current unit and integration suites
- Helm chart and GitOps deployment (Argo CD) to replace raw manifests
- Scheduled scraping per site (Celery beat) instead of manual and API-triggered runs
- Email and webhook delivery channels for alerts
- Continuous matching on newly discovered offers instead of batch runs

---

## Author

**Ahmed Aziz Ben Ayed** · [GitHub](https://github.com/AhmedAzizBENAYED)

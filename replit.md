## replit.md — Build Rules for AI‑KMS

> **Goal for the Replit agent**: Design and implement AI‑KMS as **microservice‑based**, using **object‑oriented programming (OOP)** principles. **Any single source file must be ≤ 600 lines** (hard cap; target 300–500). If a file approaches 550 lines, split it.

This doc is the single source of truth for architecture, coding standards, file limits, and workflows the agent must follow.

---

## 1) High‑Level Architecture (Microservices)

All backend code is split into independently deployable services with clear API contracts. Prefer **internal REST**; use **WebSocket** only where real‑time is required.

**Services (initial set):**

1. **api-gateway** (public edge)

   * Responsibilities: AuthN/AuthZ enforcement, request routing, rate limiting, input validation, API key management.
   * Talks to: all internal services via HTTP.

2. **auth-svc**

   * Responsibilities: Replit Auth + OIDC, session/token issuance (JWT), RBAC policy checks.
   * Storage: PostgreSQL (users, roles, permissions).

3. **doc-ingest-svc**

   * Responsibilities: file upload (Multer at the gateway), extraction (LlamaParse/textract), metadata normalization, OCR fallback, thumbnailing; emits “DocumentExtracted”.
   * Storage: Object storage (local dev), Postgres (doc records),
   * Queue: Redis streams or RabbitMQ for events.

4. **embedding-svc**

   * Responsibilities: **provider‑agnostic embeddings** via an `EmbeddingsClient` interface; maintain vector index; expose semantic search API.
   * Backends supported (pluggable): OpenAI, Hugging Face/Sentence‑Transformers, Voyage, Jina, Nomic, local (Ollama) — selected by env var.
   * Storage: start with in‑memory index (dev); implement repository interface with **pgvector** adapter planned.

5. **search-svc**

   * Responsibilities: hybrid retrieval (keyword + vector), filters, ranking, pagination.
   * Talks to: embedding-svc; Postgres for metadata.

6. **agent-svc**

   * Responsibilities: AI chat orchestration w/ document context, tool use, system prompts, guardrails, tests; expose `/chat` and `/run-eval`.
   * **LLM‑agnostic** via an `LLMClient` interface (chat/completions, vision optional). No provider SDKs outside infrastructure adapters.

7. **csat-svc**

   * Responsibilities: conversation sentiment → 0–100 CSAT scoring; batch/stream modes; aggregates for dashboards.

8. **realtime-svc**

   * Responsibilities: WebSocket relay for live chat widget + human takeover, session fan‑out, presence.

9. **line-bridge-svc**

   * Responsibilities: LINE OA webhook ingestion, message normalization, outbound reply buffer; uses message relay pattern to agent-svc.

10. **nlp-svc** (Python + LangChain)

    * Responsibilities: All advanced NLP tasks (entity extraction, summarization, sentiment, classification) implemented in Python.
    * Framework: FastAPI + **LangChain**.
    * **LLM‑agnostic** orchestration (providers swapped via LangChain drivers/connectors).
    * Communicates with other services via REST (JSON) only.
    * All NLP tasks should use **Python‑LangChain** for orchestration.

11. **admin-ui (frontend)**

* Responsibilities: React 18 + TS, Tailwind + shadcn/ui, TanStack Query, Wouter, Vite.

> Each service is a separate package with its own `Dockerfile`, tests, and CI job. No cross‑service imports.

---

## 1.a Provider‑Agnostic AI Layer (Hard Rule)

* Define **ports** (interfaces) in `/packages/contracts/ai/`:

  * `LLMClient` → `chat(messages, tools?)`, `completion(prompt)`, optional `vision(image+prompt)`.
  * `EmbeddingsClient` → `embed(texts[], modelHint?)`.
* Implement **adapters** per provider in service infrastructure layers:

  * `/services/agent-svc/infrastructure/llm/OpenAIClient.ts`
  * `/services/agent-svc/infrastructure/llm/AnthropicClient.ts`
  * `/services/agent-svc/infrastructure/llm/OllamaClient.ts` (local)
  * `/services/embedding-svc/infrastructure/embeddings/SentenceTransformersClient.ts`, etc.
* **Selection by ENV** (no code edits): `AI_PROVIDER=openai|anthropic|vertex|cohere|ollama|vllm` and `EMBEDDINGS_PROVIDER=openai|huggingface|voyage|jina|nomic|ollama`.
* **No provider‑specific code** in domain or application layers.

---

## 2) Repo Layout (Monorepo, Microservices inside)

```
/ (repo root)
  /services
    /api-gateway
    /auth-svc
    /doc-ingest-svc
    /embedding-svc
    /search-svc
    /agent-svc
    /csat-svc
    /realtime-svc
    /line-bridge-svc
  /apps
    /admin-ui
  /packages
    /ts-config           # shared tsconfig bases
    /eslint-config       # shared eslint rules
    /contracts           # OpenAPI specs + TypeBox/ Zod schemas, never app logic
    /utils               # small, pure helpers (≤ 400 LOC/file); no network calls
  /infra
    docker-compose.yml   # local dev only
    k8s/                 # manifests or helm charts (optional)
  replit.md              # this file
```

---

## 3) API Contracts & Schemas

* All service endpoints must be defined in **OpenAPI 3.1** under `/packages/contracts/<service>.yaml`.
* Runtime validation with **Zod** (or TypeBox) at boundaries (gateway + service controllers).
* No controller code without a referenced schema.

**Required base endpoints:**

* `auth-svc`: `/login`, `/refresh`, `/me`, `/roles`, `/policies/:id/check`.
* `doc-ingest-svc`: `/documents` (POST upload → returns `docId`), `/documents/:id`, `/documents/:id/contents`.
* `embedding-svc`: `/embed` (POST), `/vectors/search` (POST), `/vectors/upsert`.
* `search-svc`: `/search` (POST) hybrid query.
* `agent-svc`: `/chat` (POST), `/eval`.
* `csat-svc`: `/score` (POST), `/aggregate` (GET).
* `realtime-svc`: `/ws` (WS), `/rooms/:id`.
* `line-bridge-svc`: `/webhook`.

---

## 4) Object‑Oriented Design Rules (Node.js + TypeScript)

* **Layering per service**

  * `domain/` → Entities, Value Objects, Domain Events (no framework deps).
  * `application/` → Use‑cases (Services) orchestrating repositories and external ports.
  * `infrastructure/` → Express controllers, DB adapters (Drizzle), HTTP clients, message bus.
* **SOLID** enforced:

  * Single responsibility per class.
  * Dependency inversion: use interfaces for repositories/clients; inject implementations.
* **Class naming**: `*Service` (use‑case), `*Repository`, `*Client`, `*Controller`, `*Mapper`.
* **No god classes** (> \~300 lines) or mega files.
* **Error handling**: use domain errors (e.g., `InvalidDocumentError`) and map to HTTP in controllers.
* **Testing**: unit test domain/services with fakes; adapters get integration tests.

**Example domain sketch (doc‑ingest):**

```ts
// domain/Document.ts
export class Document {
  constructor(
    readonly id: string,
    readonly ownerId: string,
    private _status: 'NEW'|'PROCESSED'|'FAILED',
    readonly createdAt: Date
  ) {}
  markProcessed() { this._status = 'PROCESSED'; }
}
```

---

## 5) File Size & Complexity Limits (HARD RULE)

* **Max lines/file: 600** (including imports & whitespace). Target 300–500.
* **Max lines/function: 80**. Extract helpers/methods.
* **Max cyclomatic complexity: 10** per function.

**Tooling to enforce:**

1. **ESLint** shared config (`/packages/eslint-config`) with rules:

   * `max-lines`: \["error", { max: 600, skipComments: false, skipBlankLines: false }]
   * `max-lines-per-function`: \["error", { max: 80, skipComments: false, IIFEs: true }]
   * `complexity`: \["error", { max: 10 }]
   * `max-depth`: \["error", 4], `max-params`: \["warn", 4]
2. **Prettier** to keep formatting consistent.
3. **Husky + lint-staged** pre‑commit hook to block oversize diffs.
4. **CI gate** (see §9) failing on any violation.

---

## 6) Frontend (admin‑ui) Rules

* React 18 + TS, Tailwind + shadcn/ui, TanStack Query, Wouter, Vite.
* **File limits:**

  * Components ≤ 300 lines. If more, split into `Feature`, `Subcomponent`, and `hooks/*`.
  * One component per file; co‑located `*.test.tsx` allowed.
* **State**: Remote state via TanStack Query; local UI state via `useState`/`useReducer`.
* **OOP in FE**: Encapsulate domain-ish logic in service classes (fetchers) or custom hooks; keep components declarative and thin.
* **Directory pattern:**

```
/apps/admin-ui/src
  /features
    /documents
      DocumentPage.tsx
      components/UploadDropzone.tsx
      hooks/useUpload.ts
      api/DocumentClient.ts
```

* **Design tokens** via Tailwind config. No inline magic numbers.
* **Charts**: Recharts; keep data formatting outside render.

---

## 7) Backend Service Template (per service)

```
/services/<name>/
  src/
    domain/
    application/
    infrastructure/
      http/
        controllers/
        routes.ts
      db/
      messaging/
    index.ts
  test/
  Dockerfile
  tsconfig.json
  package.json
```

**Controller skeleton** (keep small):

```ts
// infrastructure/http/controllers/CreateEmbeddingController.ts
export class CreateEmbeddingController { /* ≤ 120 lines */ }
```

**Use‑case skeleton**:

```ts
// application/CreateEmbedding.ts
export class CreateEmbedding { /* ≤ 200 lines with private helpers */ }
```

---

## 8) Data & Storage

* **PostgreSQL** (Neon in prod) via **Drizzle ORM**; migrations per service.
* **Vector Index**: start in‑memory; implement `VectorStore` interface with future `PgVectorStore` adapter.
* **File storage**: local FS in dev; adapter interface for S3 in prod.
* **No service shares DB tables**; communicate via HTTP or events.

---

## 9) Messaging & Events

* Use Redis Streams (dev) for events like `DocumentExtracted`, `VectorsUpserted`, `MessageReceived`.
* Define event contracts in `/packages/contracts/events/*.ts` (schemas + types).
* Handlers must be idempotent (dedupe keys).

---

## 10) Security, Auth, RBAC

* JWT access + refresh tokens from **auth-svc**; gateway verifies on every call.
* RBAC tables: Users, Roles, RolePermissions, Department mapping.
* Services query **auth-svc** `/policies/:id/check` for sensitive ops.
* Input validation with Zod; output filtering for PII.

---

## 11) Testing Strategy

* **Unit**: domain + application layers (≥ 70% coverage target).
* **Integration**: controllers ↔ adapters (HTTP, DB, OpenAI stubs).
* **Contract tests**: api-gateway vs each service using OpenAPI.
* **E2E (local)**: docker‑compose spins all services with seeded data.

---

## 12) CI / CD Rules

* **CI checks (every push/PR):**

  1. Typecheck (tsc ‑‑noEmit)
  2. ESLint (with max‑lines, complexity, etc.)
  3. Unit + integration tests
  4. Build each service & admin‑ui
* PRs must show that no file > 600 lines. Script:

  * `pnpm run check:lines` → fails if any `*.ts{,x}` > 600.
* **CD**: optional; keep each service dockerized.

---

## 13) Observability

* Use pino logging; one line JSON per entry.
* Correlation IDs from gateway (`x‑request‑id`).
* Health: `/healthz` (liveness) & `/readyz` (readiness) per service.

---

## 14) Enterprise & Integrations

* **LINE OA**: isolate in `line-bridge-svc`. No LINE SDK usage in agent-svc.
* **HR/REST integrations**: create dedicated `*Client` classes; never inline HTTP in controllers.
* **Live Chat Widget**: authenticate via short‑lived tokens from gateway; realtime-svc handles WS.

---

## 15) Guardrails for AI Agents

* Guardrail config (toxicity, topics, PII) lives in `agent-svc/domain/Guardrails.ts`.
* Evaluation harness at `agent-svc/application/RunEval.ts` with fixtures.

---

## 16) Performance Budgets

* P95 API latency ≤ 400 ms for search.
* Upload → searchable SLA ≤ 30 s for 10‑page PDFs (dev baseline).
* Frontend route interactive ≤ 2 s on cold load.

---

## 17) “Do / Don’t” for the Replit Agent

**Do**

* Split code early to respect file caps.
* Generate OpenAPI first; scaffold controllers from it.
* Write tests for domain/services before adapters.
* Encapsulate third‑party calls in `*Client` classes with retries and timeouts.

**Don’t**

* Don’t create single “mega” services or controllers.
* Don’t bypass gateway auth.
* Don’t share DB tables or models across services.
* Don’t exceed 600 lines in any file—split immediately.

---

## 18) Snippets (drop‑in)

**Shared ESLint config (excerpt)**

```json
{
  "rules": {
    "max-lines": ["error", { "max": 600, "skipComments": false, "skipBlankLines": false }],
    "max-lines-per-function": ["error", { "max": 80 }],
    "complexity": ["error", { "max": 10 }],
    "max-depth": ["error", 4],
    "max-params": ["warn", 4]
  }
}
```

**Husky pre‑commit**

```bash
pnpm -w lint && pnpm -w test && pnpm -w check:lines
```

**Line check script** (`scripts/check-lines.mjs`)

```js
import { globby } from 'globby';
import fs from 'node:fs';
const files = await globby(['**/*.{ts,tsx,js,jsx}','!**/node_modules/**']);
let bad = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n').length;
  if (lines > 600) bad.push({ f, lines });
}
if (bad.length) {
  console.error('Files exceeding 600 lines:', bad);
  process.exit(1);
}
```

---

## 19) Migration Path (Vector store)

* Implement `VectorStore` interface now (in memory) with the same methods planned for `PgVectorStore`.
* Swap via DI without touching calling code.

---

## 20) Acceptance Checklist (merge only if all ✓)

* [ ] OpenAPI updated for changed endpoints.
* [ ] No file exceeds 600 lines; functions ≤ 80 lines.
* [ ] New logic added behind tests (unit or integration).
* [ ] Contracts validated at runtime.
* [ ] Services remain independent (no cross‑imports, no shared DB tables).
* [ ] Security reviewed (auth + RBAC paths covered).

---

**That’s it.** Keep it small, split early, ship often. If a file’s getting chonky, give it the ol’ **slice‑and‑dice**. 🍰

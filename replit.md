# AI-KMS Project Guidelines

## Overview

AI-KMS (AI-powered Knowledge Management System) is designed to be a microservice-based, object-oriented platform for intelligent document ingestion, semantic search, and AI-driven conversational agents. Its primary purpose is to streamline knowledge retrieval and interaction within an enterprise context, offering features like document embedding, intelligent search, and an AI chat orchestration engine. The project aims to deliver a highly scalable, maintainable, and extensible system by adhering to strict architectural and coding standards. This system has high market potential for organizations seeking advanced, AI-powered knowledge solutions.

## User Preferences

The user expects the AI agent to:
- Design and implement AI-KMS as microservice-based, using object-oriented programming (OOP) principles.
- Ensure any single source file must be ≤ 600 lines (hard cap; target 300–500). If a file approaches 550 lines, split it.
- Prioritize splitting code early to respect file caps.
- Generate OpenAPI first and scaffold controllers from it.
- Write tests for domain/services before adapters.
- Encapsulate third-party calls in `*Client` classes with retries and timeouts.
- Avoid creating single “mega” services or controllers.
- Not bypass gateway authentication.
- Not share database tables or models across services.
- Not exceed 600 lines in any file—split immediately.
- Ensure that for merge, OpenAPI is updated for changed endpoints.
- Ensure that for merge, no file exceeds 600 lines; functions ≤ 80 lines.
- Ensure that for merge, new logic is added behind tests (unit or integration).
- Ensure that for merge, contracts are validated at runtime.
- Ensure that for merge, services remain independent (no cross‑imports, no shared DB tables).
- Ensure that for merge, security is reviewed (auth + RBAC paths covered).

## System Architecture

The AI-KMS system is built on a microservices architecture, where all backend code is split into independently deployable services with clear API contracts. Communication between services primarily uses **internal REST**, with **WebSocket** used only for real-time requirements.

**Core Principles:**
- **Provider-Agnostic AI Layer**: AI capabilities are abstracted through interfaces (`LLMClient`, `EmbeddingsClient`) allowing different AI providers (e.g., OpenAI, Hugging Face, Anthropic) to be swapped via environment variables without code changes.
- **Object-Oriented Design (OOP)**: Strict adherence to SOLID principles, with a layered architecture (`domain/`, `application/`, `infrastructure/`) per service.
- **Monorepo Structure**: The repository is organized as a monorepo, containing individual services, frontend applications, and shared packages (contracts, utils, configurations).
- **API Contracts**: All service endpoints are defined using OpenAPI 3.1 specifications, with runtime validation enforced by Zod or TypeBox at service boundaries.
- **Strict File and Complexity Limits**: A hard cap of 600 lines per file (target 300-500 lines) and 80 lines per function, with a maximum cyclomatic complexity of 10 per function. This is enforced by ESLint, Prettier, Husky pre-commit hooks, and CI/CD gates.
- **Frontend Architecture**: Built with React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Wouter, and Vite. Components are limited to 300 lines and follow a feature-sliced directory structure.
- **Data Storage**: PostgreSQL (with Drizzle ORM) is used for relational data, with an emphasis on no shared tables across services. Vector indexing starts in-memory with a `VectorStore` interface for future `pgvector` integration. File storage is abstracted for local development and S3 in production.
- **Messaging & Events**: Redis Streams are used for inter-service communication via events, with event contracts defined and handlers designed for idempotency.
- **Security & Authorization**: JWT-based authentication with a dedicated `auth-svc` for session management and RBAC. API Gateway enforces authentication and authorization on all requests.
- **Testing Strategy**: Comprehensive testing includes unit tests for domain/application layers, integration tests for controllers and adapters, contract tests using OpenAPI, and end-to-end tests via Docker Compose.
- **Observability**: Centralized logging with pino (JSON format) and correlation IDs for request tracing. Each service exposes `/healthz` and `/readyz` endpoints.
- **Performance Budgets**: Specific performance targets are set, including P95 API latency for search (≤ 400 ms), document upload to searchable SLA (≤ 30s for 10-page PDFs), and frontend route interactive time (≤ 2s cold load).

## External Dependencies

The project integrates with various external services and tools:

- **Databases**:
    - **PostgreSQL**: Primary data store, with a planned `pgvector` extension for vector indexing.
- **AI/ML Services**:
    - **OpenAI**: Pluggable LLM and embedding provider.
    - **Hugging Face / Sentence-Transformers**: Pluggable embedding provider.
    - **Voyage, Jina, Nomic**: Pluggable embedding providers.
    - **Ollama**: Local LLM and embedding provider option.
    - **Anthropic, Vertex AI, Cohere, vLLM**: Pluggable LLM providers.
    - **LlamaParse**: Used for document extraction in `doc-ingest-svc`.
    - **LangChain**: Used in `nlp-svc` for advanced NLP task orchestration.
- **Messaging/Queuing**:
    - **Redis Streams**: For inter-service event communication.
    - **RabbitMQ**: Alternative queueing option for events.
- **Cloud Services**:
    - **Neon**: Managed PostgreSQL service (for production).
    - **S3-compatible storage**: For file storage (for production).
- **Other Third-Party Libraries/Tools**:
    - **Multer**: For file uploads (at API Gateway).
    - **textract**: For text extraction from documents.
    - **Drizzle ORM**: For database interactions.
    - **Zod / TypeBox**: For runtime schema validation.
    - **React 18**: Frontend framework.
    - **Tailwind CSS, shadcn/ui**: Frontend styling and UI components.
    - **TanStack Query**: For remote state management in the frontend.
    - **Wouter**: For routing in the frontend.
    - **Vite**: Frontend build tool.
    - **Recharts**: For charting in the frontend.
    - **pino**: For structured logging.
    - **ESLint**: For code linting and style enforcement.
    - **Prettier**: For code formatting.
    - **Husky, lint-staged**: For Git hooks and pre-commit checks.
    - **Docker**: For containerization of services.
    - **LINE OA**: Integrated via `line-bridge-svc` for messaging.
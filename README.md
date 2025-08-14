
# AI-KMS (AI Knowledge Management System)

A microservices-based knowledge management system with AI-powered search, chat, and document processing capabilities.

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- OpenAI API key (or other supported LLM provider)

### Installation

```bash
npm install
```

### Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Required environment variables:

```bash
# Core services
AUTH_SVC_URL=http://localhost:3001
LEGACY_BASE_URL=http://localhost:5000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ai_kms

# AI Providers
OPENAI_API_KEY=your_openai_key_here
AI_PROVIDER=openai
EMBEDDINGS_PROVIDER=openai

# Auth (Replit)
REPLIT_CLIENT_ID=your_replit_client_id
REPLIT_CLIENT_SECRET=your_replit_client_secret
```

### Development

Start the development server:

```bash
npm run dev
```

This will start:
- Main application on port 5000
- Frontend dev server with Vite
- API routes and services

### Build

```bash
npm run build
```

## Architecture

AI-KMS follows a microservices architecture with the following services:

- **api-gateway**: Request routing, auth enforcement, rate limiting
- **auth-svc**: Authentication and authorization (Replit Auth + RBAC)
- **doc-ingest-svc**: Document upload, extraction, metadata processing
- **embedding-svc**: Vector embeddings and semantic search
- **search-svc**: Hybrid search (keyword + semantic)
- **agent-svc**: AI chat orchestration and tool use
- **csat-svc**: Customer satisfaction scoring
- **realtime-svc**: WebSocket support for live chat
- **line-bridge-svc**: LINE Official Account integration
- **nlp-svc**: Advanced NLP tasks (Python + LangChain)

## Smoke Tests

### Auth Endpoints

```bash
# Check user info
curl -i http://localhost:5000/me

# Login
curl -i -X POST http://localhost:5000/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"dev"}'

# Refresh token
curl -i -X POST http://localhost:5000/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"stub-refresh-token"}'

# Check roles
curl -i http://localhost:5000/roles
```

### WebSocket Test

Open `/test-websocket.html` in your browser to test real-time connections.

### Document Upload

```bash
# Upload a document
curl -i -X POST http://localhost:5000/api/documents \
  -F "file=@your-document.pdf" \
  -F "title=Test Document"
```

### Search

```bash
# Semantic search
curl -i -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"your search query","type":"semantic"}'
```

## Development Tools

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Database Migrations
```bash
# Run pending migrations
npm run db:migrate

# Generate new migration
npm run db:generate
```

## Project Structure

```
/
├── apps/admin-ui/          # React frontend
├── server/                 # Legacy monolith (being refactored)
├── services/              # Microservices
│   ├── api-gateway/
│   ├── auth-svc/
│   ├── doc-ingest-svc/
│   └── ...
├── packages/              # Shared packages
│   ├── contracts/         # OpenAPI specs & schemas
│   ├── utils/            # Shared utilities
│   └── ...
└── infra/                # Infrastructure configs
```

## Provider Support

### LLM Providers
- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude)
- Local (Ollama)
- Vertex AI
- Cohere

### Embedding Providers
- OpenAI
- Hugging Face / Sentence Transformers
- Voyage AI
- Jina AI
- Nomic
- Local (Ollama)

Switch providers by setting `AI_PROVIDER` and `EMBEDDINGS_PROVIDER` environment variables.

## Contributing

1. Follow the 600-line file limit (see `replit.md`)
2. Use object-oriented design patterns
3. Write tests for new features
4. Update OpenAPI specs for API changes
5. Run `npm run lint` and `npm run typecheck` before committing

## License

MIT

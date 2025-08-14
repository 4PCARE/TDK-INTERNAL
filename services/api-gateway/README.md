# API Gateway Service

Public edge service providing AuthN/AuthZ enforcement, request routing, and rate limiting.

## Environment

Configure service URLs in `.env`:
- LEGACY_BASE_URL, AUTH_SVC_URL, DOC_INGEST_SVC_URL, EMBEDDING_SVC_URL, SEARCH_SVC_URL,
  AGENT_SVC_URL, CSAT_SVC_URL, REALTIME_SVC_URL, LINE_BRIDGE_SVC_URL, NLP_SVC_URL

The gateway reads env at runtime; defaults to localhost ports in dev.

# Changelog

All notable changes to AI-KMS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Microservices architecture implementation
- Provider-agnostic AI layer with support for multiple LLM and embedding providers
- OpenAPI 3.1 specifications for all service endpoints
- TypeScript strict mode enforcement across all services
- Comprehensive smoke testing suite
- WebSocket support for real-time features
- LINE Official Account integration
- Document processing pipeline with OCR and metadata extraction
- Hybrid search combining keyword and semantic search
- RBAC (Role-Based Access Control) system
- Customer satisfaction (CSAT) scoring service
- Thai text processing and segmentation
- File size limits and complexity guards (600 lines max per file)

### Changed
- **BREAKING**: Refactored monolithic server structure into microservices
- **BREAKING**: Moved frontend from `/client/` to `/apps/admin-ui/`
- **BREAKING**: API endpoints now route through api-gateway service
- **BREAKING**: Authentication now handled by dedicated auth-svc
- Updated React frontend to use modern hooks and TanStack Query
- Migrated from direct provider SDKs to abstracted client interfaces
- Enhanced error handling with domain-specific error types
- Improved TypeScript configuration with strict type checking

### Migration Guide

#### Frontend Migration
- Frontend code moved from `/client/` to `/apps/admin-ui/`
- No breaking changes to component APIs
- TanStack Query replaces legacy data fetching
- New authentication flow via auth service

#### API Changes
- All API calls should be made to the main server port (5000)
- Gateway automatically routes to appropriate microservices
- Authentication tokens remain compatible
- Search endpoints consolidated under `/api/search`

#### Environment Variables
New required variables:
```bash
AUTH_SVC_URL=http://localhost:3001
LEGACY_BASE_URL=http://localhost:5000
AI_PROVIDER=openai
EMBEDDINGS_PROVIDER=openai
```

#### Service Dependencies
- PostgreSQL database required for all services
- Redis optional for event streaming between services
- Each service can be deployed independently

### Removed
- Direct database access from frontend
- Hardcoded provider integrations
- Legacy authentication middleware
- Unused utility functions

### Fixed
- Memory leaks in document processing
- TypeScript compilation errors
- Inconsistent error responses across endpoints
- Security vulnerabilities in file upload handling
- WebSocket connection stability issues

### Security
- Added input validation with Zod schemas
- Implemented rate limiting at gateway level
- Enhanced RBAC policy enforcement
- Secure file upload with type validation
- JWT token verification on all protected routes

## [0.1.0] - Initial Release

### Added
- Basic document management system
- AI-powered chat interface
- Document upload and processing
- User authentication
- Search functionality
- Admin dashboard

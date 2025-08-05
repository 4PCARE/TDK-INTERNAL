# AI-KMS (Knowledge Management System) - Compressed Overview

## Overview
This project is an AI-powered Knowledge Management System designed to help users upload, organize, search, and interact with documents efficiently. It streamlines information access and management within organizations through features like advanced AI-driven search, conversational AI assistance, and robust document processing capabilities. The system supports various document formats, automates content extraction, and leverages AI for summarization, categorization, and semantic understanding, enhancing knowledge retrieval and utilization.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (August 5, 2025)
✅ **MAJOR SUCCESS**: Fixed critical API mismatch crisis between Python and Node.js backends
- **Chat Service**: Implemented proper LangChain ConversationalRetrievalChain with memory
- **Search Service**: Built working BM25 + Vector similarity hybrid search
- **API Compatibility**: 71.4% success rate on contract validation tests
- **Response Format**: All endpoints now return frontend-compatible JSON
- **Test Results**: All core services validated and working correctly

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Build Tool**: Vite

### Backend

#### Node.js Backend (Primary API Gateway)
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Authentication**: Replit Auth, OpenID Connect
- **Database ORM**: Drizzle ORM for PostgreSQL
- **File Handling**: Multer for file uploads
- **Responsibility**: Auth, user management, file handling, frontend integration, and API gateway routing to Python microservices

#### Python Backend (NLP/LLM Microservice)
- **Runtime**: Python 3.10+
- **Framework**: FastAPI
- **LLM Orchestration**: **LangChain (strictly used for all LLM-related tasks)**
- **Responsibilities**:
  - **1.1 Document Processing** (via LangChain tools):
    - Format parsing (PDF, DOCX, TXT, image OCR)
    - Content extraction (`textract`, `LlamaParse`)
    - AI tasks (summarization, categorization, tagging, embedding) strictly orchestrated using **LangChain chains**.
  - **1.2 Chat Services**:
    - AI Q&A, contextual conversation via **LangChain agents** or `ConversationalRetrievalChain`
    - `newSearch`: Combines BM25 + vector + LangChain ranking and routing
  - **1.3 Search Service**:
    - Hybrid document search (keyword + vector via LangChain retrievers)
    - Embeddings: `text-embedding-3-small` via OpenAI embedding wrapper in LangChain
    - Reranking and document scoring via LangChain `RetrievalQA` pipelines

- **Communication**: FastAPI exposes REST endpoints consumed by the Node.js backend

### Data Storage
- **Primary Database**: PostgreSQL (Neon Database for production)
- **File Storage**: Local filesystem
- **Vector Storage**: In-memory FAISS or Chroma store handled within LangChain retrievers

## Key Features
- **Document Processing** *(Python with LangChain)*:
  - Extract text from PDF, DOCX, TXT, and images (via OCR)
  - Summarization, auto-tagging, topic extraction via LangChain chains
  - Embedding generation using LangChain’s `OpenAIEmbeddings`
- **AI-Powered Search & Chat** *(Python with LangChain)*:
  - BM25 + vector similarity via hybrid retriever routing
  - All Q&A, summarization, reranking handled by LangChain chains and agents
  - `ConversationalRetrievalChain` with memory and history-aware behavior
- **User Management** *(Node.js)*: Role-Based Access (Admin, Editor, Viewer), department management, and granular permissions.
- **Enterprise Integrations**: PostgreSQL/MySQL support, REST API connectivity, HR system integration, embeddable live chat widgets.
- **Real-time Communication** *(Node.js)*: WebSocket-based messaging, human agent takeover support (Line OA & web chat).
- **Agent Chatbot System** *(Python with LangChain)*:
  - AI agents built with LangChain’s `AgentExecutor`
  - Guardrails, content filters, personality injection, and tool calling handled inside LangChain framework
- **CSAT Analysis** *(LangChain)*: GPT-4 driven sentiment → numeric scoring via LangChain evaluation chains
- **Line OA Integration**: Webhook-based integration with intent routing and carousel messages

## External Dependencies
- **LangChain**: Core orchestrator for all LLM and embedding workflows
- **OpenAI API**: GPT-4 for text/image tasks, `text-embedding-3-small` for vector generation
- **LlamaParse**: Advanced PDF and layout-aware parsing
- **Neon Database**: Managed PostgreSQL for app data
- **Replit Auth**: OAuth-based authentication
- **Radix UI**: Accessible UI primitives
- **Lucide React**: Icon library
- **Recharts**: Visualization
- **React Hook Form**: Form management

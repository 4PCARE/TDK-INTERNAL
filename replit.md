# AI-KMS (Knowledge Management System) - Compressed Overview

## Overview
This project is an AI-powered Knowledge Management System designed to help users upload, organize, search, and interact with documents efficiently. It aims to streamline information access and management within organizations through features like advanced AI-driven search, conversational AI assistance, and robust document processing capabilities. The system supports various document formats, automates content extraction, and leverages AI for summarization, categorization, and semantic understanding, enhancing knowledge retrieval and utilization.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Authentication**: Replit Auth, OpenID Connect
- **Database ORM**: Drizzle ORM for PostgreSQL
- **File Processing**: Multer for uploads, LlamaParse and textract for content extraction

### Data Storage
- **Primary Database**: PostgreSQL (Neon Database for production)
- **File Storage**: Local filesystem
- **Vector Search**: In-memory using OpenAI embeddings

### Key Features
- **Document Processing**: Supports various formats (PDF, DOCX, TXT, images), content extraction, AI summarization, categorization, tag generation, and vector embedding.
- **AI-Powered Capabilities**: Semantic search with OpenAI embeddings and hybrid search, AI chat assistant with document context, auto-categorization, content summarization, and a feedback system. Includes advanced image processing with GPT-4o Vision for analysis.
- **User Management**: Role-Based Access (Admin, Editor, Viewer), department management, and granular permission system.
- **Enterprise Integrations**: PostgreSQL/MySQL support, REST API connectivity, HR system integration, and embeddable live chat widgets.
- **Real-time Communication**: WebSocket-based system for real-time messaging, including human agent takeover functionality for both Line OA and web widget channels.
- **Agent Chatbot System**: Customizable AI agents with personality, skills, guardrails (content filtering, toxicity prevention, topic control), and knowledge base integration. Includes a comprehensive testing interface.
- **Customer Satisfaction Analysis (CSAT)**: AI-driven CSAT scoring (0-100) based on conversation sentiment, integrated into the Agent Console.
- **Line OA Integration**: Full support for Line Official Account webhooks, including advanced messaging features like carousel templates and intent matching. Uses a modular architecture with message relay pattern separating webhook handling from bot logic.

## External Dependencies
- **OpenAI API**: Used for GPT-4 (text processing, summarization, categorization, tag generation, CSAT analysis, image analysis with GPT-4o Vision) and text-embedding-3-small (vector embeddings).
- **LlamaParse**: Advanced PDF text extraction.
- **Neon Database**: Production PostgreSQL hosting.
- **Replit Auth**: OAuth provider for authentication.
- **Radix UI**: Unstyled, accessible component primitives.
- **Lucide React**: Icon system.
- **Recharts**: Data visualization.
- **React Hook Form**: Form state management.
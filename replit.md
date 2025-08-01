# AI-KMS (Knowledge Management System) - Project Overview

## Overview
The AI-KMS is a full-stack, AI-powered Knowledge Management System designed for efficient document handling. It allows users to upload, organize, search, and interact with documents using advanced AI capabilities. Key features include intelligent document processing, semantic search, AI chat assistance, robust user management, and enterprise-level integrations. The vision is to provide a comprehensive solution for businesses to leverage their internal knowledge efficiently, improving productivity and decision-making.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Authentication**: Replit Auth with OpenID Connect
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **File Processing**: Multer for uploads, LlamaParse and textract for content extraction

### Data Storage Solutions
- **Primary Database**: PostgreSQL (Neon Database for production)
  - Schemas for user management, document storage, chat system, analytics, permissions, and HR employee lookup.
- **File Storage**: Local filesystem
- **Vector Search**: In-memory vector storage using OpenAI embeddings

### Key Features & Design Patterns
- **Document Processing Pipeline**: Supports multi-format uploads (PDF, DOCX, TXT, images), content extraction, AI processing (summarization, categorization, tagging) using OpenAI GPT-4, and vector embedding using text-embedding-3-small.
- **AI-Powered Capabilities**:
    - **Advanced Semantic Search**: OpenAI text-embedding-3-small for semantic and hybrid search (semantic + keyword). Includes document chunking and search analytics.
    - **Conversational AI**: Chat assistant with document context, feedback system, and image analysis via GPT-4o Vision.
    - **Automated Content Analysis**: AI-generated categories, tags, and summaries.
    - **Live Chat Widgets**: Embeddable widgets with human takeover capabilities.
    - **Agent Chatbots**: Configurable AI agents with personality, skills, guardrails (content filtering, toxicity prevention, topic control), and knowledge base integration. Supports Line OA webhooks for multi-channel communication.
    - **Customer Satisfaction (CSAT) Analysis**: Real-time CSAT score calculation using GPT-4o for conversation sentiment.
    - **Carousel Intent Matching**: AI-driven intent matching for Line message templates with tag-based filtering.
- **User Management System**: Role-Based Access Control (Admin, Editor, Viewer), department management, and document/department level permissions.
- **Deployment Strategy**: Vite for frontend build, esbuild for backend, Drizzle Kit for database migrations.

## External Dependencies

### Core Services
- **OpenAI API**: GPT-4, GPT-4o Vision, and text-embedding-3-small for various AI tasks.
- **LlamaParse**: Advanced PDF text extraction.
- **Neon Database**: Production PostgreSQL hosting.

### Authentication & Security
- **Replit Auth**: OAuth provider integration.

### UI/UX Libraries
- **Radix UI**: Accessible component primitives.
- **Lucide React**: Icon system.
- **Recharts**: Data visualization.
- **React Hook Form**: Form state management.
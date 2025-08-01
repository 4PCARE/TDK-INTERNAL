# AI-KMS (Knowledge Management System) - Project Overview

## Overview
The AI-KMS is a full-stack, AI-powered Knowledge Management System designed to help users upload, organize, search, and interact with documents efficiently. Its core purpose is to provide intelligent document processing, semantic search, AI chat assistance, and robust user management, with a vision for enterprise-level deployment and integration. Key capabilities include multi-format file processing, AI-driven summarization and categorization, conversational AI agents, and comprehensive analytics.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Frontend Framework**: React 18 with TypeScript.
- **Styling**: Tailwind CSS with shadcn/ui for modern, accessible components.
- **Design Approach**: Focus on intuitive user interfaces with clear navigation and visual indicators for document status (e.g., endorsed documents with trophy icons, effective date tooltips).
- **Interactive Elements**: Resizable chat modals, real-time chat display with user/AI/human agent distinctions, comprehensive form handling with validation.

### Technical Implementations
- **Backend Runtime**: Node.js with TypeScript and Express.js for RESTful APIs.
- **Authentication**: Replit Auth with OpenID Connect and session management.
- **Database ORM**: Drizzle ORM with PostgreSQL dialect for structured data.
- **File Processing**: Multer for uploads, enhanced with LlamaParse and textract for content extraction.
- **AI Processing**: Integration with OpenAI GPT-4 for summarization, categorization, and content generation; text-embedding-3-small for semantic search embeddings.
- **Vector Search**: In-memory vector storage with intelligent document chunking (3000-character chunks with 300-character overlap) and hybrid search combining semantic and keyword approaches for precise content retrieval.
- **AI-Powered Features**:
    - **Advanced Semantic Search**: Leveraging OpenAI embeddings, document chunking, and hybrid search.
    - **Conversational AI**: Chat assistants with document context, real-time message broadcasting via WebSockets, and human agent takeover capabilities.
    - **Image Processing**: GPT-4o Vision for image analysis with synchronous processing and context persistence.
    - **Guardrails System**: Comprehensive input and output validation, including toxicity checking, content filtering, and topic restrictions, applied to both AI and human agent interactions.
    - **Customer Satisfaction Analysis (CSAT)**: OpenAI GPT-4o-based CSAT scoring from chat history.
    - **Line OA Integration**: Webhook system for Line messaging, including carousel intent matching with dynamic templates.
    - **Live Chat Widget**: Embeddable chat widgets with full Agent Chatbot integration, human takeover, and markdown rendering.
- **Data Storage**: PostgreSQL as the primary database, local filesystem for file storage.
- **Deployment Strategy**: Vite for frontend builds, esbuild for backend bundling, Drizzle Kit for schema management. Environment variables for configuration.

### Feature Specifications
- **Document Management**: Multi-format file upload, AI-powered summarization, categorization, tag generation, and effective date range management.
- **User & Access Management**: Role-Based Access Control (Admin, Editor, Viewer), department management, document-level and department-level permissions.
- **Agent Chatbot Configuration**: Customizable personality, profession, response style, special skills, and advanced guardrails.
- **Real-time Communication**: WebSocket for instant message updates in Agent Console and Live Chat Widgets.
- **Audit & Monitoring**: Detailed chat audit logging, including user messages, AI responses, and human agent actions.
- **Integrations**: HR system integration (Thai Citizen ID), generic API connectivity, and specific Line OA integration.

## External Dependencies

- **OpenAI API**: Used for GPT-4 (text processing, summarization, categorization, CSAT analysis) and text-embedding-3-small (vector embeddings).
- **LlamaParse**: Advanced PDF text extraction service.
- **Neon Database**: Production-ready serverless PostgreSQL hosting.
- **Replit Auth**: OAuth provider integration for user authentication.
- **Radix UI**: Unstyled, accessible component primitives for frontend.
- **Lucide React**: Icon system for UI.
- **Recharts**: Data visualization components.
- **React Hook Form**: Form state management.
- **Multer**: Node.js middleware for handling multipart/form-data, primarily for file uploads.
- **@llamaindex/cloud**: For advanced PDF processing capabilities.
// Auto-generated TypeScript types for Python Backend API
// Generated from OpenAPI schema

export interface ChatRequest {
  message: string;
  conversation_history?: Array<{role: string; content: string}>;
  search_documents?: boolean;
}

export interface ChatResponse {
  response: string;
  sources: Array<{
    id: string;
    title: string;
    score: number;
    match_type?: string;
  }>;
  search_performed: boolean;
  documents_found: number;
  search_stats?: {
    total_found: number;
    selected_count: number;
    final_count: number;
  };
}

export interface DocumentResponse {
  id: number | string;
  name: string;
  content: string;
  summary: string;
  createdAt: string;
  fileSize: number;
  tags: string[];
  aiCategory: string;
  mimeType: string;
}

export interface SearchRequest {
  query: string;
  search_type?: string;
  limit?: number;
  keyword_weight?: number;
  vector_weight?: number;
}

export interface SearchResponse {
  query: string;
  search_type: string;
  results: DocumentResponse[];
  total_found: number;
}

export interface UploadResponse {
  success: boolean;
  document_id: string;
  message: string;
  summary: string;
  tags: string[];
  category: string;
  name: string;
  file_size: number;
  content_length: number;
}

export interface ApiError {
  detail: string;
}

// API Client types
export type ApiResponse<T> = T | ApiError;

export interface PythonBackendClient {
  chat: (request: ChatRequest) => Promise<ApiResponse<ChatResponse>>;
  chatMessage: (message: string) => Promise<ApiResponse<ChatResponse>>;
  getDocuments: () => Promise<ApiResponse<DocumentResponse[]>>;
  searchDocuments: (query: string, type?: string) => Promise<ApiResponse<DocumentResponse[]>>;
  uploadDocument: (file: File) => Promise<ApiResponse<UploadResponse>>;
}
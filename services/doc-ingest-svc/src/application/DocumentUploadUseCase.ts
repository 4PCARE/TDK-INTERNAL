
import { Document, DocumentMetadata, DocumentStatus } from '../domain/Document.js';

export interface UploadDocumentRequest {
  title?: string;
  category?: string;
  description?: string;
  file: {
    originalname: string;
    path: string;
    mimetype: string;
    size: number;
  };
}

export interface UploadDocumentResponse {
  success: boolean;
  document?: {
    id: string;
    title: string;
    status: DocumentStatus;
    createdAt: string;
  };
  error?: string;
}

/**
 * Use case for handling document uploads
 */
export class DocumentUploadUseCase {
  async execute(request: UploadDocumentRequest): Promise<UploadDocumentResponse> {
    try {
      // Generate unique document ID
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create document metadata
      const metadata: DocumentMetadata = {
        id: documentId,
        title: request.title || request.file.originalname,
        filename: request.file.originalname,
        filepath: request.file.path,
        mimetype: request.file.mimetype,
        size: request.file.size,
        category: request.category || 'general',
        description: request.description || '',
        status: 'uploaded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const document = new Document(metadata);

      // TODO: Save to database
      console.log('Document created:', document.toJSON());

      // TODO: Emit event for processing pipeline
      this.emitDocumentUploadedEvent(document);

      return {
        success: true,
        document: {
          id: document.id,
          title: document.title,
          status: document.status,
          createdAt: metadata.createdAt
        }
      };

    } catch (error) {
      console.error('Document upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private emitDocumentUploadedEvent(document: Document): void {
    // TODO: Implement event emission for processing pipeline
    console.log(`DocumentUploaded event emitted for document ${document.id}`);
    
    // This would trigger:
    // 1. Text extraction service
    // 2. Chunking service  
    // 3. Embedding service
    // 4. Search index update
  }
}

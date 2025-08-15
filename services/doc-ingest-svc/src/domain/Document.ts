
/**
 * Document domain entity representing uploaded documents
 */
export interface DocumentMetadata {
  id: string;
  title: string;
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
  category: string;
  description?: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  processingSteps?: ProcessingStep[];
}

export type DocumentStatus = 
  | 'uploaded' 
  | 'extracting' 
  | 'extracted' 
  | 'chunking' 
  | 'chunked' 
  | 'embedding' 
  | 'processed' 
  | 'failed';

export interface ProcessingStep {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedAt?: string;
  error?: string;
}

export class Document {
  constructor(
    private metadata: DocumentMetadata
  ) {}

  get id(): string { return this.metadata.id; }
  get title(): string { return this.metadata.title; }
  get status(): DocumentStatus { return this.metadata.status; }
  get filepath(): string { return this.metadata.filepath; }
  get mimetype(): string { return this.metadata.mimetype; }

  markAsExtracting(): void {
    this.metadata.status = 'extracting';
    this.metadata.updatedAt = new Date().toISOString();
  }

  markAsProcessed(): void {
    this.metadata.status = 'processed';
    this.metadata.updatedAt = new Date().toISOString();
  }

  markAsFailed(error: string): void {
    this.metadata.status = 'failed';
    this.metadata.updatedAt = new Date().toISOString();
  }

  addProcessingStep(step: ProcessingStep): void {
    if (!this.metadata.processingSteps) {
      this.metadata.processingSteps = [];
    }
    this.metadata.processingSteps.push(step);
  }

  toJSON(): DocumentMetadata {
    return { ...this.metadata };
  }
}

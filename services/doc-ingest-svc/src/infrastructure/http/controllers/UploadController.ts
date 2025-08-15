
import type { Request, Response } from 'express';
import { DocumentUploadUseCase } from '../../../application/DocumentUploadUseCase.js';

/**
 * Controller for document upload operations
 */
export class UploadController {
  private uploadUseCase: DocumentUploadUseCase;

  constructor() {
    this.uploadUseCase = new DocumentUploadUseCase();
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { title, category, description } = req.body;

      const result = await this.uploadUseCase.execute({
        title,
        category,
        description,
        file: {
          originalname: req.file.originalname,
          path: req.file.path,
          mimetype: req.file.mimetype,
          size: req.file.size
        }
      });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(500).json({
          error: 'Document upload failed',
          message: result.error
        });
      }

    } catch (error) {
      console.error('Upload controller error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getDocumentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // TODO: Fetch from database/repository
      const document = {
        id,
        title: 'Sample Document',
        status: 'processed',
        createdAt: new Date().toISOString(),
        processingSteps: [
          { step: 'uploaded', status: 'completed', completedAt: new Date().toISOString() },
          { step: 'extracted', status: 'completed', completedAt: new Date().toISOString() },
          { step: 'chunked', status: 'completed', completedAt: new Date().toISOString() },
          { step: 'embedded', status: 'completed', completedAt: new Date().toISOString() }
        ]
      };

      res.json(document);
    } catch (error) {
      console.error('Get document status error:', error);
      res.status(500).json({ error: 'Failed to get document status' });
    }
  }
}

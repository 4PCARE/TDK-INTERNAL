
import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';

export interface UploadStatus {
  fileName: string;
  progress: number;
  status: 'uploading' | 'extracting' | 'embedding' | 'completed' | 'paused' | 'error';
  uploadedBytes: number;
  totalBytes: number;
  userId: string;
}

class UploadStatusService {
  private io: SocketIOServer | null = null;
  private uploadStatuses = new Map<string, UploadStatus>();

  initialize(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected for upload status:', socket.id);

      socket.on('join-upload-room', (userId: string) => {
        socket.join(`upload-${userId}`);
        // Send current status for this user
        const userUploads = Array.from(this.uploadStatuses.values())
          .filter(status => status.userId === userId);
        socket.emit('upload-status-update', userUploads);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  updateUploadStatus(fileName: string, status: Partial<UploadStatus>) {
    const existing = this.uploadStatuses.get(fileName) || {
      fileName,
      progress: 0,
      status: 'uploading' as const,
      uploadedBytes: 0,
      totalBytes: 0,
      userId: ''
    };

    const updated = { ...existing, ...status };
    this.uploadStatuses.set(fileName, updated);

    // Broadcast to user's room
    if (this.io && updated.userId) {
      this.io.to(`upload-${updated.userId}`).emit('upload-status-update', [updated]);
    }
  }

  removeUploadStatus(fileName: string) {
    const status = this.uploadStatuses.get(fileName);
    this.uploadStatuses.delete(fileName);
    
    if (this.io && status?.userId) {
      this.io.to(`upload-${status.userId}`).emit('upload-status-removed', fileName);
    }
  }

  getUserUploads(userId: string): UploadStatus[] {
    return Array.from(this.uploadStatuses.values())
      .filter(status => status.userId === userId);
  }
}

export const uploadStatusService = new UploadStatusService();


/**
 * Validation utilities for doc-ingest-svc responses
 * Uses Zod if available, fallback to basic type checking
 */

export function validateUploadReq(data: any): data is { title: string; mimeType: string; content?: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const UploadReqSchema = z.object({
      title: z.string(),
      mimeType: z.string(),
      content: z.string().optional(),
    });
    UploadReqSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.title === "string" &&
      typeof data.mimeType === "string" &&
      (data.content === undefined || typeof data.content === "string")
    );
  }
}

export function validateUploadRes(data: any): data is { docId: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const UploadResSchema = z.object({
      docId: z.string(),
    });
    UploadResSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.docId === "string"
    );
  }
}

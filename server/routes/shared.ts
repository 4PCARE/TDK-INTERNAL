
import multer from "multer";
import path from "path";
import fs from "fs/promises";

// File upload configuration
import path from "path";

const uploadDir = path.join(process.cwd(), "uploads");

// Ensure upload directory exists
export const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

export const storage_multer = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Fix Thai filename encoding if needed
    let correctedFileName = file.originalname;
    try {
      // Check if filename contains Thai characters that are garbled
      if (
        file.originalname.includes("à¸") ||
        file.originalname.includes("à¹")
      ) {
        // Try to decode and re-encode properly
        const buffer = Buffer.from(file.originalname, "latin1");
        correctedFileName = buffer.toString("utf8");
      }
    } catch (error) {
      console.warn("Failed to fix filename encoding:", error);
      // Keep original filename if encoding fix fails
    }

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(correctedFileName);
    const nameWithoutExt = path.basename(correctedFileName, extension);
    
    // Limit the base filename to prevent filesystem errors
    // Account for fieldname + uniqueSuffix + extension
    const maxBaseLength = 240 - file.fieldname.length - uniqueSuffix.toString().length - 2 - extension.length;
    const truncatedName = nameWithoutExt.length > maxBaseLength 
      ? nameWithoutExt.substring(0, maxBaseLength) 
      : nameWithoutExt;
    
    const finalFilename = `${file.fieldname}-${uniqueSuffix}-${truncatedName}${extension}`;
    
    cb(null, finalFilename);
  },
});

export const upload = multer({
  storage: storage_multer,
  fileFilter: (req, file, cb) => {
    // Ensure proper UTF-8 encoding for filename
    if (file.originalname) {
      file.originalname = Buffer.from(file.originalname, "latin1").toString(
        "utf8",
      );
    }

    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "text/plain",
      "text/csv",
      "application/json",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Supported: PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, and image files.",
        ),
      );
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

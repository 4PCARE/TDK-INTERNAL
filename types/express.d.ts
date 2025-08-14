
declare global {
  namespace Express {
    interface Request {
      skipAuth?: boolean;
    }
  }
}

export {};

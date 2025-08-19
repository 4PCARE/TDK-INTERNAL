
declare global {
  var wsClients: Set<any>;
  namespace Express {
    interface Request {
      skipAuth?: boolean;
    }
  }
}

export {};

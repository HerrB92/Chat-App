export interface NormalizedClaims {
  oid: string;
  tid: string;
  name: string;
  preferredUsername: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: NormalizedClaims;
      user?: NormalizedClaims;
    }
  }
}

declare module "socket.io" {
  interface SocketData {
    auth: NormalizedClaims;
  }
}

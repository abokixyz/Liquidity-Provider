// types.d.ts - Global type declarations

declare global {
    namespace NodeJS {
      interface Global {
        gc?: () => void;
      }
    }
    
    var gc: (() => void) | undefined;
  }
  
  // Extend Express Request if needed
  declare namespace Express {
    interface Request {
      user?: any;
      rateLimitInfo?: any;
    }
  }
  
  export {};
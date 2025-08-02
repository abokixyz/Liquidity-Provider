// middleware/apiKeyAuth.ts - Fixed API Key Authentication Middleware
import { Request, Response, NextFunction } from 'express';
import { ApiKey, IApiKey } from '../models/ApiKey';
import { IUser } from '../models/User';
import { User } from '../models/User';
import rateLimit from 'express-rate-limit';

interface ApiKeyRequest extends Request {
  user?: IUser;
  apiKey?: IApiKey;
}

// API Key authentication middleware
export const apiKeyAuth = async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check for API key in headers or query params
    const apiKeyHeader = req.headers['x-api-key'] as string || 
                        req.headers['authorization']?.replace('ApiKey ', '') ||
                        req.query.apiKey as string;
    
    if (!apiKeyHeader) {
      res.status(401).json({
        success: false,
        message: 'API key required',
        code: 'MISSING_API_KEY'
      });
      return;
    }

    // Verify API key
    const validApiKey = await ApiKey.verifyApiKey(apiKeyHeader);
    
    if (!validApiKey) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired API key',
        code: 'INVALID_API_KEY'
      });
      return;
    }

    // Check if API key is active
    if (!validApiKey.isActive) {
      res.status(401).json({
        success: false,
        message: 'API key has been revoked',
        code: 'REVOKED_API_KEY'
      });
      return;
    }

    // Check if API key is expired
    if (validApiKey.isExpired()) {
      res.status(401).json({
        success: false,
        message: 'API key has expired',
        code: 'EXPIRED_API_KEY'
      });
      return;
    }

    // Add API key and user info to request
    req.apiKey = validApiKey;
    req.user = await User.findById(validApiKey.userId) as IUser;
    
    console.log('✅ Valid API key used:', {
      name: validApiKey.name,
      service: validApiKey.service,
      user: (validApiKey.userId as any)?.email || 'Unknown'
    });
    
    next();
    
  } catch (error) {
    console.error('❌ API key authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

// Check specific permissions middleware
export const requirePermissions = (requiredPermissions: string[]) => {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'API key required for permission check',
        code: 'MISSING_API_KEY'
      });
      return;
    }

    // Check if API key has required permissions
    const hasPermission = apiKey.hasAnyPermission(requiredPermissions);
    
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${requiredPermissions.join(' or ')}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        required: requiredPermissions,
        current: apiKey.permissions
      });
      return;
    }
    
    next();
  };
};

// Check specific service access middleware
export const requireService = (allowedServices: string[]) => {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'API key required for service check',
        code: 'MISSING_API_KEY'
      });
      return;
    }

    if (!allowedServices.includes(apiKey.service)) {
      res.status(403).json({
        success: false,
        message: `Service access denied. Required: ${allowedServices.join(' or ')}`,
        code: 'SERVICE_ACCESS_DENIED',
        required: allowedServices,
        current: apiKey.service
      });
      return;
    }
    
    next();
  };
};

// Admin check for API keys
export const apiKeyAdminOnly = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  const apiKey = req.apiKey;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      message: 'API key required for admin access',
      code: 'MISSING_API_KEY'
    });
    return;
  }

  // Check if API key has admin permissions
  const hasAdminAccess = apiKey.hasPermission('admin') || 
                        apiKey.service === 'admin' ||
                        apiKey.permissions.includes('admin');
  
  if (!hasAdminAccess) {
    res.status(403).json({
      success: false,
      message: 'Admin API key required. Current permissions insufficient.',
      code: 'INSUFFICIENT_ADMIN_PERMISSIONS',
      required: 'admin permission or admin service',
      current: {
        service: apiKey.service,
        permissions: apiKey.permissions
      }
    });
    return;
  }
  
  console.log('✅ Admin API key access granted:', {
    name: apiKey.name,
    service: apiKey.service,
    permissions: apiKey.permissions
  });
  
  next();
};

// Dual authentication middleware (JWT or API Key)
export const dualAuth = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  const hasApiKey = req.headers['x-api-key'] || req.query.apiKey;
  const hasJwtToken = req.headers.authorization?.startsWith('Bearer');
  
  if (hasApiKey) {
    // Use API key authentication (async function call)
    apiKeyAuth(req, res, next).catch(next);
    return;
  } else if (hasJwtToken) {
    // Use JWT authentication - you'll need to import your JWT middleware
    const { protect } = require('./auth'); // Adjust import path
    return protect(req, res, next);
  } else {
    res.status(401).json({
      success: false,
      message: 'Authentication required: provide API key or JWT token',
      code: 'NO_AUTHENTICATION'
    });
  }
};

// Enhanced dual auth that supports admin functions
export const dualAuthWithAdmin = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  const hasApiKey = req.headers['x-api-key'] || req.query.apiKey;
  const hasJwtToken = req.headers.authorization?.startsWith('Bearer');
  
  if (hasApiKey) {
    // Use API key authentication (async function call)
    apiKeyAuth(req, res, next).catch(next);
    return;
  } else if (hasJwtToken) {
    // Use JWT authentication with your existing protect + adminOnly middleware
    const { protect, adminOnly } = require('./auth'); // Adjust import path
    return protect(req, res, (err: any) => {
      if (err) return next(err);
      // For JWT users, still check if they have admin role
      return adminOnly(req, res, next);
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Authentication required: provide API key or JWT token',
      code: 'NO_AUTHENTICATION'
    });
  }
};

// Admin authentication for both JWT and API keys
export const adminAuth = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  const hasApiKey = req.headers['x-api-key'] || req.query.apiKey;
  const hasJwtToken = req.headers.authorization?.startsWith('Bearer');
  
  if (hasApiKey) {
    // API key authentication with admin check (handle async)
    apiKeyAuth(req, res, (err) => {
      if (err) return next(err);
      return apiKeyAdminOnly(req, res, next);
    }).catch(next);
    return;
  } else if (hasJwtToken) {
    // JWT authentication with admin check
    const { protect, adminOnly } = require('./auth'); // Adjust import path
    return protect(req, res, (err: any) => {
      if (err) return next(err);
      return adminOnly(req, res, next);
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Admin authentication required: provide admin JWT token or admin API key',
      code: 'NO_ADMIN_AUTH'
    });
  }
};

// Rate limiting per API key - FIXED
export const createApiKeyRateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req: ApiKeyRequest): string => {
      // Always return a string - use API key ID, IP, or fallback
      return req.apiKey?._id?.toString() || req.ip || 'anonymous';
    },
    message: {
      success: false,
      message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 60000} minutes`,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Dynamic rate limiting based on API key settings - FIXED
export const dynamicApiKeyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: ApiKeyRequest) => {
    // Different limits based on API key service or permissions
    if (req.apiKey?.service === 'admin' || req.apiKey?.hasPermission('admin')) {
      return 1000; // Higher limit for admin keys
    }
    if (req.apiKey?.service === 'analytics') {
      return 500; // Medium limit for analytics
    }
    return 100; // Default limit
  },
  keyGenerator: (req: ApiKeyRequest): string => {
    // Always return a string
    return req.apiKey?._id?.toString() || req.ip || 'anonymous';
  },
  message: (req: ApiKeyRequest) => ({
    success: false,
    message: `Rate limit exceeded for ${req.apiKey?.service || 'unknown'} service`,
    code: 'RATE_LIMIT_EXCEEDED',
    service: req.apiKey?.service
  })
});

// Validation middleware for API key operations
export const validateApiKeyRequest = (req: Request, res: Response, next: NextFunction): void => {
  const { name, service, permissions } = req.body;
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length < 3) {
    res.status(400).json({
      success: false,
      message: 'Name is required and must be at least 3 characters',
      code: 'INVALID_NAME'
    });
    return;
  }
  
  if (!service || !['liquidity', 'trading', 'admin', 'analytics'].includes(service)) {
    res.status(400).json({
      success: false,
      message: 'Valid service is required (liquidity, trading, admin, analytics)',
      code: 'INVALID_SERVICE'
    });
    return;
  }
  
  if (permissions && !Array.isArray(permissions)) {
    res.status(400).json({
      success: false,
      message: 'Permissions must be an array',
      code: 'INVALID_PERMISSIONS'
    });
    return;
  }
  
  if (permissions) {
    const validPermissions = ['read', 'write', 'admin', 'withdraw', 'create', 'delete'];
    const invalidPermissions = permissions.filter((p: string) => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid permissions: ${invalidPermissions.join(', ')}`,
        code: 'INVALID_PERMISSIONS',
        valid: validPermissions
      });
      return;
    }
  }
  
  next();
};

// Middleware to log API key usage
export const logApiKeyUsage = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  if (req.apiKey) {
    console.log('📊 API Key Usage:', {
      keyName: req.apiKey.name,
      service: req.apiKey.service,
      permissions: req.apiKey.permissions,
      endpoint: `${req.method} ${req.path}`,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Middleware to check API key expiration warning
export const checkApiKeyExpiration = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  if (req.apiKey && req.apiKey.expiresAt) {
    const daysUntilExpiration = req.apiKey.getDaysUntilExpiration();
    
    if (daysUntilExpiration !== null && daysUntilExpiration <= 7) {
      // Add warning header for keys expiring within 7 days
      res.setHeader('X-API-Key-Expiration-Warning', `API key expires in ${daysUntilExpiration} days`);
      
      if (daysUntilExpiration <= 1) {
        console.warn('⚠️ API Key expiring soon:', {
          keyName: req.apiKey.name,
          daysUntilExpiration,
          userEmail: (req.apiKey.userId as any)?.email
        });
      }
    }
  }
  next();
};

// Middleware to ensure API key has not exceeded usage limits
export const checkApiKeyUsageLimits = (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
  // This could be enhanced to check daily/monthly usage limits
  // For now, it's a placeholder for future implementation
  if (req.apiKey) {
    // You could add logic here to check against usage quotas
    // stored in the database or Redis
  }
  next();
};

// Combined middleware for comprehensive API key handling
export const comprehensiveApiKeyAuth = [
  apiKeyAuth,
  checkApiKeyExpiration,
  logApiKeyUsage,
  checkApiKeyUsageLimits
];

// Export types for use in other files
export type { ApiKeyRequest };

// Export all middleware functions
export default {
  apiKeyAuth,
  requirePermissions,
  requireService,
  apiKeyAdminOnly,
  dualAuth,
  dualAuthWithAdmin,
  adminAuth,
  createApiKeyRateLimit,
  dynamicApiKeyRateLimit,
  validateApiKeyRequest,
  logApiKeyUsage,
  checkApiKeyExpiration,
  checkApiKeyUsageLimits,
  comprehensiveApiKeyAuth
};
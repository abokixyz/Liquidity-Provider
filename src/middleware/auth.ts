import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { User, IUser } from '../models/User';

interface AuthRequest extends Request {
  user?: IUser;
}

interface TokenPayload extends JwtPayload {
  id: string;
}

// Enhanced user interface to include admin properties
interface IUserWithRole extends IUser {
  adminLevel?: number;
  permissions?: string[];
  lastLoginAt?: Date;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    console.log('🔍 Auth Debug:');
    console.log('- Path:', req.path);
    console.log('- Method:', req.method);
    console.log('- Token received:', token ? 'Yes' : 'No');
    console.log('- JWT_SECRET exists:', process.env.JWT_SECRET ? 'Yes' : 'No');
    console.log('- User-Agent:', req.headers['user-agent']?.substring(0, 50) + '...');

    if (!token) {
      console.log('❌ No token provided');
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.log('❌ JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        message: 'Server configuration error.',
        code: 'CONFIG_ERROR'
      });
      return;
    }

    // Verify token
    console.log('🔐 Verifying token...');
    const decoded = jwt.verify(token, secret) as TokenPayload;
    console.log('✅ Token decoded successfully:', { 
      userId: decoded.id,
      issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'N/A',
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'N/A'
    });
            
    // Get user from token with admin-related fields
    console.log('👤 Looking up user...');
    const user = await User.findById(decoded.id);
    if (!user) {
      console.log('❌ User not found in database');
      res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Enhance user object with admin detection
    const enhancedUser = user as IUserWithRole;
    
    // Detect admin status using multiple methods
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
    
    // Set role based on email (fallback if role field doesn't exist)
    if (superAdminEmails.includes(user.email.toLowerCase())) {
      enhancedUser.role = 'superadmin';
      enhancedUser.adminLevel = 3;
      enhancedUser.permissions = ['read', 'write', 'delete', 'admin', 'superadmin'];
    } else if (adminEmails.includes(user.email.toLowerCase())) {
      enhancedUser.role = 'admin';
      enhancedUser.adminLevel = 2;
      enhancedUser.permissions = ['read', 'write', 'admin'];
    } else {
      // If no role is set, default to 'user'
      if (!enhancedUser.role) {
        enhancedUser.role = 'user';
      }
      enhancedUser.adminLevel = 1;
      enhancedUser.permissions = ['read'];
    }

    console.log('✅ User authenticated:', { 
      id: user._id, 
      email: user.email,
      role: enhancedUser.role,
      adminLevel: enhancedUser.adminLevel,
      isEmailVerified: user.isEmailVerified
    });

    req.user = enhancedUser;
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error);
    
    if (error instanceof TokenExpiredError) {
      console.log('🕒 Token expired at:', error.expiredAt);
      res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED',
        expiredAt: error.expiredAt
      });
      return;
    }
    
    if (error instanceof JsonWebTokenError) {
      console.log('🔒 Invalid token format:', error.message);
      res.status(401).json({
        success: false,
        message: 'Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
      return;
    }
    
    console.log('🚫 General token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.',
      code: 'INVALID_TOKEN'
    });
  }
};

// ✅ NEW: Admin-only middleware
export const adminOnly = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user as IUserWithRole;

    if (!user) {
      console.log('❌ Admin check: No user in request');
      res.status(401).json({
        success: false,
        message: 'Authentication required for admin access.',
        code: 'NO_USER'
      });
      return;
    }

    console.log('🛡️ Admin access check:', {
      userId: user._id,
      email: user.email,
      role: user.role,
      adminLevel: user.adminLevel,
      path: req.path
    });

    // Check if user has admin privileges
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
    
    const isAdmin = adminEmails.includes(user.email.toLowerCase()) || 
                   superAdminEmails.includes(user.email.toLowerCase()) ||
                   user.role === 'admin' || 
                   user.role === 'superadmin';

    if (!isAdmin) {
      console.log('🚫 Admin access denied for user:', {
        email: user.email,
        role: user.role,
        adminEmails: adminEmails.length,
        superAdminEmails: superAdminEmails.length
      });
      
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
        code: 'INSUFFICIENT_PRIVILEGES',
        required: 'admin',
        current: user.role || 'user'
      });
      return;
    }

    console.log('✅ Admin access granted for:', {
      email: user.email,
      role: user.role,
      adminLevel: user.adminLevel
    });
    
    next();
  } catch (error) {
    console.error('❌ Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in admin authorization.',
      code: 'ADMIN_AUTH_ERROR'
    });
  }
};

// ✅ NEW: Super admin only middleware
export const superAdminOnly = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user as IUserWithRole;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required for super admin access.',
        code: 'NO_USER'
      });
      return;
    }

    console.log('👑 Super admin access check:', {
      userId: user._id,
      email: user.email,
      role: user.role,
      path: req.path
    });

    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
    const isSuperAdmin = superAdminEmails.includes(user.email.toLowerCase()) || user.role === 'superadmin';

    if (!isSuperAdmin) {
      console.log('🚫 Super admin access denied for user:', user.email);
      res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.',
        code: 'INSUFFICIENT_PRIVILEGES',
        required: 'superadmin',
        current: user.role || 'user'
      });
      return;
    }

    console.log('✅ Super admin access granted for:', user.email);
    next();
  } catch (error) {
    console.error('❌ Super admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in super admin authorization.',
      code: 'SUPER_ADMIN_AUTH_ERROR'
    });
  }
};

// ✅ NEW: Role-based access control
export const requireRole = (allowedRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as IUserWithRole;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required.',
          code: 'NO_USER'
        });
        return;
      }

      console.log('🎭 Role-based access check:', {
        userId: user._id,
        email: user.email,
        userRole: user.role,
        allowedRoles,
        path: req.path
      });

      // Check if user's role is in allowed roles
      const userRole = user.role;
      if (!allowedRoles.includes(userRole)) {
        console.log('🚫 Role access denied:', {
          userRole,
          allowedRoles,
          email: user.email
        });
        
        res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          code: 'INSUFFICIENT_ROLE',
          required: allowedRoles,
          current: userRole
        });
        return;
      }

      console.log('✅ Role access granted:', {
        userRole,
        email: user.email
      });
      
      next();
    } catch (error) {
      console.error('❌ Role middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error in role authorization.',
        code: 'ROLE_AUTH_ERROR'
      });
    }
  };
};

// ✅ NEW: Permission-based access control
export const requirePermission = (requiredPermissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as IUserWithRole;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required.',
          code: 'NO_USER'
        });
        return;
      }

      const userPermissions = user.permissions || ['read'];
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );

      console.log('🔑 Permission check:', {
        userId: user._id,
        email: user.email,
        userPermissions,
        requiredPermissions,
        hasPermission,
        path: req.path
      });

      if (!hasPermission) {
        console.log('🚫 Permission denied:', {
          userPermissions,
          requiredPermissions,
          email: user.email
        });
        
        res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredPermissions,
          current: userPermissions
        });
        return;
      }

      console.log('✅ Permission granted for:', user.email);
      next();
    } catch (error) {
      console.error('❌ Permission middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error in permission authorization.',
        code: 'PERMISSION_AUTH_ERROR'
      });
    }
  };
};

export const requireEmailVerification = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const user = req.user;
  
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required.',
      code: 'NO_USER'
    });
    return;
  }

  console.log('📧 Email verification check:', {
    userId: user._id,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    path: req.path
  });

  if (!user.isEmailVerified) {
    console.log('🚫 Email verification required for:', user.email);
    res.status(403).json({
      success: false,
      message: 'Please verify your email address to access this resource.',
      code: 'EMAIL_NOT_VERIFIED',
      email: user.email
    });
    return;
  }

  console.log('✅ Email verified for:', user.email);
  next();
};

// ✅ NEW: Get user info endpoint (useful for admin dashboards)
export const getUserInfo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user as IUserWithRole;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
      return;
    }

    console.log('ℹ️ User info requested:', user.email);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          adminLevel: user.adminLevel || 1,
          permissions: user.permissions || ['read'],
          isEmailVerified: user.isEmailVerified,
          isAdmin: (user.role === 'admin' || user.role === 'superadmin'),
          isSuperAdmin: user.role === 'superadmin',
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        },
        serverTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Get user info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user info'
    });
  }
};

// ✅ NEW: Admin access logger (middleware to log admin actions)
export const logAdminAction = (action: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user as IUserWithRole;
    
    if (user && (user.role === 'admin' || user.role === 'superadmin')) {
      console.log('🔍 ADMIN ACTION LOG:', {
        timestamp: new Date().toISOString(),
        adminId: user._id,
        adminEmail: user.email,
        adminRole: user.role,
        action,
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
    
    next();
  };
};
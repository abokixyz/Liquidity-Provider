import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import  { User,IUser } from '../models/User';

interface AuthRequest extends Request {
  user?: IUser;
}

interface TokenPayload extends JwtPayload {
  id: string;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    console.log('🔍 Auth Debug:');
    console.log('- Token received:', token ? 'Yes' : 'No');
    console.log('- JWT_SECRET exists:', process.env.JWT_SECRET ? 'Yes' : 'No');

    if (!token) {
      console.log('❌ No token provided');
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.log('❌ JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        message: 'Server configuration error.'
      });
      return;
    }

    // Verify token
    console.log('🔐 Verifying token...');
    const decoded = jwt.verify(token, secret) as TokenPayload;
    console.log('✅ Token decoded successfully:', { userId: decoded.id });
        
    // Get user from token
    console.log('👤 Looking up user...');
    const user = await User.findById(decoded.id);
    if (!user) {
      console.log('❌ User not found in database');
      res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
      return;
    }

    console.log('✅ User found:', { id: user._id, email: user.email });
    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error);
    if (error instanceof TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
      return;
    }
    if (error instanceof JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: 'Invalid token format.'
      });
      return;
    }
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

export const requireEmailVerification = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isEmailVerified) {
    res.status(403).json({
      success: false,
      message: 'Please verify your email address to access this resource.'
    });
    return;
  }
  next();
};
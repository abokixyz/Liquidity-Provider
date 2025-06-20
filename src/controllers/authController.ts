import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import User, { IUser } from '../models/User';
import brevoEmailService from '../services/brevoEmailService';

interface AuthRequest extends Request {
  user?: IUser;
}

interface TokenPayload extends JwtPayload {
  id: string;
}

// Generate JWT token
const generateToken = (id: string): string => {
    const secret = process.env.JWT_SECRET;
    const expire: jwt.SignOptions['expiresIn'] = process.env.JWT_EXPIRE as jwt.SignOptions['expiresIn'] || '7d';
    
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    console.log('🔑 Generating token:');
    console.log('- User ID:', id);
    console.log('- JWT_EXPIRE from env:', JSON.stringify(process.env.JWT_EXPIRE));
    console.log('- JWT_EXPIRE variable:', expire);
    console.log('- JWT_SECRET length:', secret.length);
    console.log('- All JWT env vars:', {
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
      JWT_EXPIRE: process.env.JWT_EXPIRE,
      NODE_ENV: process.env.NODE_ENV
    });
    
    try {
      const token = jwt.sign(
        { id }, 
        secret, 
        { expiresIn: expire }
      );
    
    // Decode to verify
    const decoded = jwt.decode(token) as TokenPayload;
    if (decoded && decoded.iat && decoded.exp) {
      console.log('- Token issued at:', new Date(decoded.iat * 1000));
      console.log('- Token expires at:', new Date(decoded.exp * 1000));
      console.log('- Seconds until expiry:', decoded.exp - decoded.iat);
    }
    
    return token;
  } catch (error) {
    console.error('Error generating token:', error);
    throw new Error('Failed to generate token');
  }
};

// Send token response
const sendTokenResponse = (user: IUser, statusCode: number, res: Response) => {
  const userId = user._id.toString();
  const token = generateToken(userId);
  
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: user.isEmailVerified
    }
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password
    });

    // Generate email verification token (for future use, but don't send email)
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    console.log('✅ User registered successfully - no welcome email sent');
    console.log(`📝 Verification token generated (not sent): ${verificationToken.substring(0, 20)}...`);

    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ User logged in successfully');
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found in request'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found in request'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      user.email = email;
      user.isEmailVerified = false; // Reset verification status
      console.log('📧 Email changed - verification status reset');
    }

    if (name) user.name = name;

    await user.save();

    console.log('✅ Profile updated successfully');
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    console.log('✅ Email verified successfully for user:', user.email);
    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during email verification'
    });
  }
};

// @desc    Forgot password (ONLY EMAIL FEATURE)
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with that email address'
      });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    console.log('🔑 Password reset token generated for:', email);

    // Send reset email - THIS IS THE ONLY EMAIL WE SEND
    try {
      console.log('📧 Sending password reset email via Brevo...');
      await brevoEmailService.sendPasswordResetEmail(user.name, user.email, resetToken);
      
      console.log('✅ Password reset email sent successfully');
      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (emailError) {
      console.error('❌ Failed to send reset email:', emailError);
      
      // Clean up the reset token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again.'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    // Hash token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    console.log('✅ Password reset successful for user:', user.email);
    console.log('📝 No confirmation email sent (emails only for password reset requests)');

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    console.log('✅ User logged out successfully');
    // Since we're using stateless JWT, we just send a success response
    // In a production app, you might want to maintain a blacklist of tokens
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};
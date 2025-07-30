import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  isEmailVerified: boolean;
  
  // ✅ NEW: Admin role fields
  role: 'user' | 'admin' | 'superadmin';
  adminGrantedAt?: Date;
  adminGrantedBy?: mongoose.Types.ObjectId;
  permissions?: string[];
  lastLoginAt?: Date;
  
  // Email verification
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  
  // Password reset
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateEmailVerificationToken(): string;
  generatePasswordResetToken(): string;
  
  // ✅ NEW: Admin methods
  isAdmin(): boolean;
  isSuperAdmin(): boolean;
  hasPermission(permission: string): boolean;
  grantAdminRole(role: 'admin' | 'superadmin', grantedBy?: mongoose.Types.ObjectId): void;
  revokeAdminRole(): void;
}

const userSchema = new Schema<IUser>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  // ✅ NEW: Role and admin fields
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user',
    index: true // Index for faster queries
  },
  adminGrantedAt: {
    type: Date,
    default: undefined
  },
  adminGrantedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: undefined
  },
  permissions: [{
    type: String,
    enum: ['read', 'write', 'delete', 'admin', 'superadmin', 'user_management', 'system_config']
  }],
  lastLoginAt: {
    type: Date,
    default: undefined
  },
  
  // Email verification fields
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Password reset fields
  passwordResetToken: String,
  passwordResetExpires: Date
}, {
  timestamps: true
});

// ✅ Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isEmailVerified: 1 });
userSchema.index({ createdAt: -1 });

// ✅ Pre-save middleware - Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ✅ Pre-save middleware - Set permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'superadmin':
        this.permissions = ['read', 'write', 'delete', 'admin', 'superadmin', 'user_management', 'system_config'];
        if (!this.adminGrantedAt) this.adminGrantedAt = new Date();
        break;
      case 'admin':
        this.permissions = ['read', 'write', 'admin', 'user_management'];
        if (!this.adminGrantedAt) this.adminGrantedAt = new Date();
        break;
      case 'user':
      default:
        this.permissions = ['read'];
        this.adminGrantedAt = undefined;
        this.adminGrantedBy = undefined;
        break;
    }
  }
  next();
});

// ✅ Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// ✅ Generate email verification token
userSchema.methods.generateEmailVerificationToken = function(): string {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  return verificationToken;
};

// ✅ Generate password reset token
userSchema.methods.generatePasswordResetToken = function(): string {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  return resetToken;
};

// ✅ NEW: Admin check methods
userSchema.methods.isAdmin = function(): boolean {
  return this.role === 'admin' || this.role === 'superadmin';
};

userSchema.methods.isSuperAdmin = function(): boolean {
  return this.role === 'superadmin';
};

userSchema.methods.hasPermission = function(permission: string): boolean {
  return this.permissions && this.permissions.includes(permission);
};

// ✅ NEW: Grant admin role method
userSchema.methods.grantAdminRole = function(role: 'admin' | 'superadmin', grantedBy?: mongoose.Types.ObjectId): void {
  this.role = role;
  this.adminGrantedAt = new Date();
  if (grantedBy) {
    this.adminGrantedBy = grantedBy;
  }
  
  // Permissions will be set automatically by pre-save middleware
  console.log(`✅ Admin role '${role}' granted to user: ${this.email}`);
};

// ✅ NEW: Revoke admin role method
userSchema.methods.revokeAdminRole = function(): void {
  const previousRole = this.role;
  this.role = 'user';
  this.adminGrantedAt = undefined;
  this.adminGrantedBy = undefined;
  this.permissions = ['read'];
  
  console.log(`🗑️ Admin role '${previousRole}' revoked from user: ${this.email}`);
};

// ✅ NEW: Virtual for admin status
userSchema.virtual('isAdminUser').get(function() {
  return this.role === 'admin' || this.role === 'superadmin';
});

// ✅ NEW: Virtual for role display
userSchema.virtual('roleDisplay').get(function() {
  switch (this.role) {
    case 'superadmin': return 'Super Administrator';
    case 'admin': return 'Administrator';
    case 'user': return 'User';
    default: return 'Unknown';
  }
});

// ✅ NEW: Static method to find admins
userSchema.statics.findAdmins = function() {
  return this.find({ 
    role: { $in: ['admin', 'superadmin'] } 
  }).select('name email role adminGrantedAt adminGrantedBy permissions createdAt');
};

// ✅ NEW: Static method to find users by role
userSchema.statics.findByRole = function(role: string) {
  return this.find({ role }).select('name email role adminGrantedAt permissions');
};

// ✅ NEW: Static method to grant admin to user by email
userSchema.statics.grantAdminByEmail = async function(email: string, role: 'admin' | 'superadmin', grantedBy?: mongoose.Types.ObjectId) {
  const user = await this.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error(`User not found with email: ${email}`);
  }
  
  user.grantAdminRole(role, grantedBy);
  await user.save();
  return user;
};

// ✅ NEW: Static method to revoke admin from user by email
userSchema.statics.revokeAdminByEmail = async function(email: string) {
  const user = await this.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error(`User not found with email: ${email}`);
  }
  
  user.revokeAdminRole();
  await user.save();
  return user;
};

// ✅ Transform JSON output to exclude sensitive fields
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  return userObject;
};

export const User = mongoose.model<IUser>('User', userSchema);
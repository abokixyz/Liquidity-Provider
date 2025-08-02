// models/ApiKey.ts - Updated interface to include virtuals and methods
import mongoose, { Document, Schema, Model } from 'mongoose';
import crypto from 'crypto';

// Interface for the ApiKey document with virtuals and methods
export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  key: string;
  hashedKey: string;
  userId: mongoose.Types.ObjectId;
  service: 'liquidity' | 'trading' | 'admin' | 'analytics';
  permissions: ('read' | 'write' | 'admin' | 'withdraw' | 'create' | 'delete')[];
  isActive: boolean;
  lastUsed?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual properties
  displayKey: string;
  timeUntilExpiration: string;
  
  // Instance methods
  hasPermission(permission: string): boolean;
  hasAnyPermission(permissions: string[]): boolean;
  isExpired(): boolean;
  getDaysUntilExpiration(): number | null;
}

// Interface for static methods
interface IApiKeyModel extends Model<IApiKey> {
  generateApiKey(): { key: string; hashedKey: string };
  verifyApiKey(providedKey: string): Promise<IApiKey | null>;
}

// Rest of the schema remains the same...
const apiKeySchema = new Schema<IApiKey>({
  name: {
    type: String,
    required: [true, 'API key name is required'],
    trim: true,
    maxlength: [100, 'API key name cannot exceed 100 characters']
  },
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  hashedKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  service: {
    type: String,
    required: [true, 'Service is required'],
    enum: {
      values: ['liquidity', 'trading', 'admin', 'analytics'],
      message: 'Service must be one of: liquidity, trading, admin, analytics'
    }
  },
  permissions: [{
    type: String,
    enum: {
      values: ['read', 'write', 'admin', 'withdraw', 'create', 'delete'],
      message: 'Permission must be one of: read, write, admin, withdraw, create, delete'
    }
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastUsed: {
    type: Date,
    index: true
  },
  expiresAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true, // Include virtuals in JSON output
    transform: function(doc, ret) {
      delete ret.hashedKey; // Don't expose the hashed key in JSON responses
      return ret;
    }
  },
  toObject: { virtuals: true } // Include virtuals in object output
});

// Indexes for better performance
apiKeySchema.index({ userId: 1, isActive: 1 });
apiKeySchema.index({ hashedKey: 1, isActive: 1 });
apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to generate API key
apiKeySchema.statics.generateApiKey = function(): { key: string; hashedKey: string } {
  const key = 'sk_' + crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hashedKey };
};

// Static method to verify API key
apiKeySchema.statics.verifyApiKey = async function(providedKey: string): Promise<IApiKey | null> {
  try {
    const hashedKey = crypto.createHash('sha256').update(providedKey).digest('hex');
    
    const apiKey = await this.findOne({ 
      hashedKey, 
      isActive: true,
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: null }
      ]
    }).populate('userId', 'name email isEmailVerified');
    
    if (apiKey) {
      apiKey.lastUsed = new Date();
      await apiKey.save();
      
      console.log('✅ API key verified:', {
        name: apiKey.name,
        service: apiKey.service,
        user: (apiKey.userId as any)?.email || 'Unknown',
        lastUsed: apiKey.lastUsed
      });
    }
    
    return apiKey;
  } catch (error) {
    console.error('❌ Error verifying API key:', error);
    return null;
  }
};

// Instance method to check if API key has specific permission
apiKeySchema.methods.hasPermission = function(permission: string): boolean {
  return this.permissions.includes('admin') || this.permissions.includes(permission);
};

// Instance method to check if API key has any of the specified permissions
apiKeySchema.methods.hasAnyPermission = function(permissions: string[]): boolean {
  if (this.permissions.includes('admin')) {
    return true;
  }
  return permissions.some(permission => this.permissions.includes(permission));
};

// Instance method to check if API key is expired
apiKeySchema.methods.isExpired = function(): boolean {
  if (!this.expiresAt) {
    return false;
  }
  return new Date() > this.expiresAt;
};

// Instance method to get remaining days until expiration
apiKeySchema.methods.getDaysUntilExpiration = function(): number | null {
  if (!this.expiresAt) {
    return null;
  }
  const now = new Date();
  const timeDiff = this.expiresAt.getTime() - now.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
};

// Pre-save middleware to validate permissions
apiKeySchema.pre('save', function(next) {
  if (!this.permissions || this.permissions.length === 0) {
    this.permissions = ['read'];
  }
  this.permissions = [...new Set(this.permissions)];
  next();
});

// Pre-save middleware to check expiration
apiKeySchema.pre('save', function(next) {
  if (this.expiresAt && this.expiresAt <= new Date()) {
    this.isActive = false;
  }
  next();
});

// Virtual for display key (first 16 chars + ...)
apiKeySchema.virtual('displayKey').get(function() {
  return this.key.length > 16 ? this.key.substring(0, 16) + '...' : this.key;
});

// Virtual for time until expiration
apiKeySchema.virtual('timeUntilExpiration').get(function() {
  if (!this.expiresAt) {
    return 'Never expires';
  }
  
  const now = new Date();
  const timeDiff = this.expiresAt.getTime() - now.getTime();
  
  if (timeDiff <= 0) {
    return 'Expired';
  }
  
  const days = Math.floor(timeDiff / (1000 * 3600 * 24));
  const hours = Math.floor((timeDiff % (1000 * 3600 * 24)) / (1000 * 3600));
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return 'Less than 1 hour';
  }
});

// Create and export the model
export const ApiKey = mongoose.model<IApiKey, IApiKeyModel>('ApiKey', apiKeySchema);

// Export default
export default ApiKey;
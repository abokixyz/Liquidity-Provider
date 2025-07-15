// ==========================================
// Wallet.ts - FINAL FIXED VERSION
// ==========================================
import mongoose, { Document, Schema, Types, Model } from 'mongoose';

export interface IWallet extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  baseAddress: string;
  basePrivateKey: string; // Now encrypted
  solanaAddress: string;
  solanaPrivateKey: string; // Now encrypted
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  
  // ✅ NEW: Encryption support fields
  isEncrypted?: boolean; // Flag to indicate if keys are encrypted
  migratedAt?: Date; // When the wallet was migrated to encryption

  // ✅ Instance methods
  getPublicInfo(): object;
}

// ✅ FIXED: Define interface for static methods
interface IWalletStatics {
  isValidEncryptedFormat(encryptedData: string): boolean;
  findWithPrivateKeys(filter: any): Promise<IWallet | null>;
}

// ✅ FIXED: Combine document interface with static methods
export interface IWalletModel extends Model<IWallet>, IWalletStatics {}

const walletSchema = new Schema<IWallet>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // ✅ This automatically creates an index
  },
  baseAddress: {
    type: String,
    required: true,
    unique: true, // ✅ This automatically creates an index
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum address format'
    }
  },
  basePrivateKey: {
    type: String,
    required: true,
    select: false, // Don't include in queries by default
    validate: {
      validator: function(this: IWallet, v: string) {
        // ✅ NEW: Support both encrypted and unencrypted formats for migration
        if (this.isEncrypted) {
          // For encrypted keys, check the format: iv:tag:data (all base64)
          const parts = v.split(':');
          return parts.length === 3 && parts.every(part => {
            try {
              Buffer.from(part, 'base64');
              return true;
            } catch {
              return false;
            }
          });
        }
        // For unencrypted keys (backward compatibility), check hex format
        return /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid private key format'
    }
  },
  solanaAddress: {
    type: String,
    required: true,
    unique: true, // ✅ This automatically creates an index
    validate: {
      validator: function(v: string) {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
      },
      message: 'Invalid Solana address format'
    }
  },
  solanaPrivateKey: {
    type: String,
    required: true,
    select: false, // Don't include in queries by default
    validate: {
      validator: function(this: IWallet, v: string) {
        // ✅ NEW: Support both encrypted and unencrypted formats for migration
        if (this.isEncrypted) {
          // For encrypted keys, check the format: iv:tag:data (all base64)
          const parts = v.split(':');
          return parts.length === 3 && parts.every(part => {
            try {
              Buffer.from(part, 'base64');
              return true;
            } catch {
              return false;
            }
          });
        }
        // For unencrypted keys (backward compatibility), check base64 format
        try {
          const decoded = Buffer.from(v, 'base64');
          return decoded.length === 64; // Solana private key should be 64 bytes
        } catch {
          return false;
        }
      },
      message: 'Invalid Solana private key format'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // ✅ NEW: Encryption support fields
  isEncrypted: {
    type: Boolean,
    default: false,
    index: true // Index for filtering encrypted/unencrypted wallets
  },
  migratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// ✅ FIXED: Remove duplicate indexes for unique fields
// walletSchema.index({ userId: 1 }); // ❌ REMOVED - already unique
// walletSchema.index({ baseAddress: 1 }); // ❌ REMOVED - already unique
// walletSchema.index({ solanaAddress: 1 }); // ❌ REMOVED - already unique

// ✅ NEW: Add compound index for encryption queries
walletSchema.index({ userId: 1, isEncrypted: 1 });

// ✅ ENHANCED: Remove sensitive fields from JSON output
walletSchema.methods.toJSON = function() {
  const walletObject = this.toObject();
  delete walletObject.basePrivateKey;
  delete walletObject.solanaPrivateKey;
  return walletObject;
};

// ✅ NEW: Add method to safely get public wallet info
walletSchema.methods.getPublicInfo = function(this: IWallet) {
  return {
    _id: this._id,
    userId: this.userId,
    baseAddress: this.baseAddress,
    solanaAddress: this.solanaAddress,
    isActive: this.isActive,
    isEncrypted: this.isEncrypted,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    migratedAt: this.migratedAt
  };
};

// ✅ FIXED: Add static method to validate encryption format
walletSchema.statics.isValidEncryptedFormat = function(encryptedData: string): boolean {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) return false;
  
  try {
    // Check if all parts are valid base64
    parts.forEach(part => Buffer.from(part, 'base64'));
    return true;
  } catch {
    return false;
  }
};

// ✅ FIXED: Add method to get wallet with private keys (for internal use only)
walletSchema.statics.findWithPrivateKeys = function(filter: any) {
  return this.findOne(filter).select('+basePrivateKey +solanaPrivateKey');
};

// ✅ FIXED: Pre-save middleware to validate encryption
walletSchema.pre('save', function(next) {
  if (this.isEncrypted) {
    // ✅ FIXED: Use proper typing for static method access
    const WalletModel = this.constructor as IWalletModel;
    
    // Validate that private keys are in encrypted format
    if (!WalletModel.isValidEncryptedFormat(this.basePrivateKey)) {
      return next(new Error('Base private key is not in valid encrypted format'));
    }
    if (!WalletModel.isValidEncryptedFormat(this.solanaPrivateKey)) {
      return next(new Error('Solana private key is not in valid encrypted format'));
    }
  }
  next();
});

// ✅ NEW: Add virtual for encryption status
walletSchema.virtual('encryptionStatus').get(function(this: IWallet) {
  return {
    encrypted: this.isEncrypted || false,
    needsMigration: !this.isEncrypted,
    migratedAt: this.migratedAt
  };
});

// ✅ FIXED: Export with proper interface that includes static methods
export const Wallet = mongoose.model<IWallet, IWalletModel>('Wallet', walletSchema);
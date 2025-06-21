// ==========================================
// Wallet.ts - FIXED
// ==========================================
import mongoose, { Document, Schema, Types } from 'mongoose';
export interface IWallet extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    baseAddress: string;
    basePrivateKey: string; // Encrypted
    solanaAddress: string;
    solanaPrivateKey: string; // Encrypted
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
  }
  
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
      unique: true // ✅ This automatically creates an index
    },
    basePrivateKey: {
      type: String,
      required: true,
      select: false // Don't include in queries by default
    },
    solanaAddress: {
      type: String,
      required: true,
      unique: true // ✅ This automatically creates an index
    },
    solanaPrivateKey: {
      type: String,
      required: true,
      select: false // Don't include in queries by default
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }, {
    timestamps: true
  });
  
  // ✅ FIXED: Remove duplicate indexes for unique fields
  // walletSchema.index({ userId: 1 }); // ❌ REMOVED - already unique
  // walletSchema.index({ baseAddress: 1 }); // ❌ REMOVED - already unique  
  // walletSchema.index({ solanaAddress: 1 }); // ❌ REMOVED - already unique
  
  // Remove sensitive fields from JSON output
  walletSchema.methods.toJSON = function() {
    const walletObject = this.toObject();
    delete walletObject.basePrivateKey;
    delete walletObject.solanaPrivateKey;
    return walletObject;
  };
  
  export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema);
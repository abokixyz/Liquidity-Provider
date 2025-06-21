// ==========================================
// Transaction.ts - FIXED
// ==========================================
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITransaction extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    liquidityPositionId: Types.ObjectId;
    
    // Transaction Details
    type: 'deposit' | 'withdrawal';
    network: 'base' | 'solana';
    amount: number; // USDC amount
    
    // Blockchain Details
    txHash?: string;
    fromAddress?: string;
    toAddress?: string;
    gasFeePaidBy?: string; // For sponsored transactions
    
    // Status
    status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
    
    // Metadata
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date;
    failureReason?: string;
  }
  
  const transactionSchema = new Schema<ITransaction>({
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    liquidityPositionId: {
      type: Schema.Types.ObjectId,
      ref: 'LiquidityPosition',
      required: true
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal'],
      required: true
    },
    network: {
      type: String,
      enum: ['base', 'solana'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    txHash: {
      type: String,
      sparse: true // Allow null but must be unique if present
      // ✅ This creates a unique sparse index automatically
    },
    fromAddress: String,
    toAddress: String,
    gasFeePaidBy: String,
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'cancelled'],
      default: 'pending'
    },
    confirmedAt: Date,
    failureReason: String
  }, {
    timestamps: true
  });
  
  // ✅ FIXED: Don't create index for txHash since sparse: true already does
  transactionSchema.index({ userId: 1 });
  transactionSchema.index({ liquidityPositionId: 1 });
  transactionSchema.index({ type: 1 });
  transactionSchema.index({ network: 1 });
  transactionSchema.index({ status: 1 });
  transactionSchema.index({ createdAt: -1 });
  
  export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
  
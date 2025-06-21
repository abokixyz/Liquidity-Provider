import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBankAccount {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
}

export interface ILiquidityPosition extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  
  // Liquidity Type
  liquidityType: 'onramp' | 'offramp';
  
  // Network Balances
  baseBalance: number; // USDC on Base
  solanaBalance: number; // USDC on Solana
  totalBalance: number; // Combined balance in USD
  
  // Bank Account for receiving fiat
  bankAccount: IBankAccount;
  
  // Position Status
  isActive: boolean;
  isVerified: boolean;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastDepositAt?: Date;
  lastWithdrawalAt?: Date;
}

const bankAccountSchema = new Schema<IBankAccount>({
  accountNumber: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        return /^\d{10}$/.test(v); // Nigerian account numbers are 10 digits
      },
      message: 'Account number must be exactly 10 digits'
    }
  },
  bankCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        return /^\d{6}$/.test(v); // ✅ FIXED: Nigerian bank codes are 6 digits (not 3)
      },
      message: 'Bank code must be exactly 6 digits' // ✅ FIXED: Updated error message
    }
  },
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const liquiditySchema = new Schema<ILiquidityPosition>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletId: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  liquidityType: {
    type: String,
    enum: ['onramp', 'offramp'],
    required: true,
    default: 'onramp'
  },
  baseBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  solanaBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  bankAccount: {
    type: bankAccountSchema,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastDepositAt: Date,
  lastWithdrawalAt: Date
}, {
  timestamps: true
});

// ✅ Indexes for performance
liquiditySchema.index({ userId: 1 });
liquiditySchema.index({ walletId: 1 });
liquiditySchema.index({ liquidityType: 1 });
liquiditySchema.index({ isActive: 1 });

// Update total balance before saving
liquiditySchema.pre('save', function(next) {
  this.totalBalance = this.baseBalance + this.solanaBalance;
  next();
});

export const LiquidityPosition = mongoose.model<ILiquidityPosition>('LiquidityPosition', liquiditySchema);
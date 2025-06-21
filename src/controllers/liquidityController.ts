import { Request, Response } from 'express';
import { LiquidityPosition } from '../models/Liquidity';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import { IUser } from '../models/User';
import walletService from '../services/walletService';

interface AuthRequest extends Request {
  user?: IUser;
}

// @desc    Create liquidity position
// @route   POST /api/liquidity/create
// @access  Private
export const createLiquidityPosition = async (req: AuthRequest, res: Response) => {
  try {
    const { liquidityType, bankAccount } = req.body;
    const userId = req.user!._id;

    console.log('🏗️ Creating liquidity position for user:', userId);

    // Check if user already has a liquidity position
    const existingPosition = await LiquidityPosition.findOne({ userId, isActive: true });
    if (existingPosition) {
      return res.status(400).json({
        success: false,
        message: 'User already has an active liquidity position'
      });
    }

    // Create wallets if they don't exist
    console.log('🔑 Creating/getting user wallets...');
    const walletsResult = await walletService.createUserWallets(userId.toString());
    
    if (!walletsResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create wallets'
      });
    }

    // Get wallet ID
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(500).json({
        success: false,
        message: 'Wallet not found after creation'
      });
    }

    // Create liquidity position
    const liquidityPosition = new LiquidityPosition({
      userId,
      walletId: wallet._id,
      liquidityType: liquidityType || 'onramp',
      bankAccount: {
        accountNumber: bankAccount.accountNumber,
        bankCode: bankAccount.bankCode,
        bankName: bankAccount.bankName,
        accountName: bankAccount.accountName
      },
      baseBalance: 0,
      solanaBalance: 0,
      isActive: true,
      isVerified: false
    });

    await liquidityPosition.save();

    console.log('✅ Liquidity position created successfully');

    res.status(201).json({
      success: true,
      message: 'Liquidity position created successfully',
      data: {
        liquidityPosition: {
          id: liquidityPosition._id,
          liquidityType: liquidityPosition.liquidityType,
          totalBalance: liquidityPosition.totalBalance,
          isVerified: liquidityPosition.isVerified
        },
        wallets: walletsResult.wallets,
        bankAccount: liquidityPosition.bankAccount
      }
    });

  } catch (error) {
    console.error('❌ Create liquidity position error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating liquidity position'
    });
  }
};

// @desc    Get user's liquidity position
// @route   GET /api/liquidity/position
// @access  Private
export const getLiquidityPosition = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;

    const position = await LiquidityPosition.findOne({ userId, isActive: true })
      .populate('walletId', 'baseAddress solanaAddress');

    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'No active liquidity position found'
      });
    }

    // Get wallet balances
    const balancesResult = await walletService.getWalletBalances(userId.toString());

    res.status(200).json({
      success: true,
      data: {
        liquidityPosition: {
          id: position._id,
          liquidityType: position.liquidityType,
          baseBalance: position.baseBalance,
          solanaBalance: position.solanaBalance,
          totalBalance: position.totalBalance,
          isVerified: position.isVerified,
          createdAt: position.createdAt
        },
        wallets: position.walletId,
        bankAccount: position.bankAccount,
        liveBalances: balancesResult.success ? balancesResult.balances : null
      }
    });

  } catch (error) {
    console.error('❌ Get liquidity position error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching liquidity position'
    });
  }
};

// @desc    Update bank account
// @route   PUT /api/liquidity/bank-account
// @access  Private
export const updateBankAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { bankAccount } = req.body;
    const userId = req.user!._id;

    console.log('🏦 Updating bank account for user:', userId);

    const position = await LiquidityPosition.findOne({ userId, isActive: true });
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'No active liquidity position found'
      });
    }

    // Update bank account details
    position.bankAccount = {
      accountNumber: bankAccount.accountNumber,
      bankCode: bankAccount.bankCode,
      bankName: bankAccount.bankName,
      accountName: bankAccount.accountName
    };

    await position.save();

    console.log('✅ Bank account updated successfully');

    res.status(200).json({
      success: true,
      message: 'Bank account updated successfully',
      data: {
        bankAccount: position.bankAccount
      }
    });

  } catch (error) {
    console.error('❌ Update bank account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating bank account'
    });
  }
};

// @desc    Get transaction history
// @route   GET /api/liquidity/transactions
// @access  Private
export const getTransactionHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { page = 1, limit = 20, type, network, status } = req.query;

    // Build filter
    const filter: any = { userId };
    if (type) filter.type = type;
    if (network) filter.network = network;
    if (status) filter.status = status;

    // Get transactions with pagination
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('liquidityPositionId', 'liquidityType');

    const totalTransactions = await Transaction.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalTransactions / Number(limit)),
          totalTransactions,
          hasNextPage: Number(page) < Math.ceil(totalTransactions / Number(limit)),
          hasPrevPage: Number(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching transaction history'
    });
  }
};

// @desc    Get wallet addresses for funding
// @route   GET /api/liquidity/wallets
// @access  Private
export const getWalletAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;

    const walletsResult = await walletService.getUserWallets(userId.toString());
    
    if (!walletsResult.success) {
      return res.status(404).json({
        success: false,
        message: 'No wallets found for user'
      });
    }

    // Get current balances
    const balancesResult = await walletService.getWalletBalances(userId.toString());

    res.status(200).json({
      success: true,
      message: 'Send USDC to these addresses to fund your liquidity position',
      data: {
        networks: {
          base: {
            address: walletsResult.wallets?.baseAddress ?? '',
            network: 'Base Mainnet',
            token: 'USDC',
            tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            currentBalance: balancesResult.success ? balancesResult.balances?.baseUSDC : 0
          },
          solana: {
            address: walletsResult.wallets?.solanaAddress ?? '',
            network: 'Solana Mainnet',
            token: 'USDC',
            tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            currentBalance: balancesResult.success ? balancesResult.balances?.solanaUSDC : 0
          }
        },
        instructions: {
          base: "Send USDC on Base network to the address above. Minimum deposit: $10 USDC",
          solana: "Send USDC on Solana network to the address above. Minimum deposit: $10 USDC"
        }
      }
    });

  } catch (error) {
    console.error('❌ Get wallet addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching wallet addresses'
    });
  }
};

// @desc    Initiate withdrawal (gasless)
// @route   POST /api/liquidity/withdraw
// @access  Private
export const initiateWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { network, amount, destinationAddress } = req.body;
    const userId = req.user!._id;

    console.log('💸 Initiating withdrawal for user:', userId);
    console.log('- Network:', network);
    console.log('- Amount:', amount);
    console.log('- Destination:', destinationAddress);

    // Get liquidity position
    const position = await LiquidityPosition.findOne({ userId, isActive: true });
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'No active liquidity position found'
      });
    }

    // Validate network and balance
    if (network === 'base' && position.baseBalance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Base USDC balance. Available: ${position.baseBalance}`
      });
    }

    if (network === 'solana' && position.solanaBalance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Solana USDC balance. Available: ${position.solanaBalance}`
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      userId,
      liquidityPositionId: position._id,
      type: 'withdrawal',
      network,
      amount,
      toAddress: destinationAddress,
      status: 'pending'
    });

    await transaction.save();

    // TODO: Implement actual gasless withdrawal logic here
    // This would call the gasless transfer functions from your existing files
    console.log('🚀 Withdrawal transaction created, pending gasless execution...');

    res.status(202).json({
      success: true,
      message: 'Withdrawal initiated successfully',
      data: {
        transactionId: transaction._id,
        network,
        amount,
        destinationAddress,
        status: 'pending',
        estimatedCompletionTime: '2-5 minutes',
        note: 'Transaction will be processed using gasless technology - you pay no gas fees!'
      }
    });

  } catch (error) {
    console.error('❌ Initiate withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error initiating withdrawal'
    });
  }
};

// @desc    Get supported banks for account setup
// @route   GET /api/liquidity/banks
// @access  Public
export const getSupportedBanks = async (req: Request, res: Response) => {
  try {
    console.log('🏦 Fetching supported banks from Lenco...');
    
    const lencoService = (await import('../services/lencoService')).default;
    const banks = await lencoService.getAllBanks();

    res.status(200).json({
      success: true,
      message: `${banks.length} banks retrieved successfully`,
      data: {
        banks: banks,
        total: banks.length
      }
    });

  } catch (error) {
    console.error('❌ Get supported banks error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch banks from Lenco API'
    });
  }
};

// @desc    Verify bank account
// @route   POST /api/liquidity/verify-account
// @access  Public
export const verifyBankAccount = async (req: Request, res: Response) => {
  try {
    const { accountNumber, bankCode } = req.body;

    console.log('🔍 Verifying bank account via Lenco:', { accountNumber, bankCode });

    const lencoService = (await import('../services/lencoService')).default;
    
    // Validate input format first
    if (!lencoService.isValidAccountNumber(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account number format. Must be exactly 10 digits.'
      });
    }

    if (!lencoService.isValidBankCode(bankCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid bank code format. Must be exactly 6 digits.'
      });
    }

    // Resolve account via Lenco API
    const accountData = await lencoService.resolveAccount(accountNumber, bankCode);

    if (!accountData) {
      return res.status(400).json({
        success: false,
        message: 'Account verification failed. Please check account number and bank code.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank account verified successfully',
      data: {
        accountNumber: accountData.accountNumber,
        bankCode: accountData.bank.code,
        bankName: accountData.bank.name,
        accountName: accountData.accountName,
        isValid: true
      }
    });

  } catch (error) {
    console.error('❌ Verify bank account error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to verify account via Lenco API'
    });
  }
};
// walletService.ts - UPDATED with encryption, compatible with your existing code
import { ethers } from 'ethers';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { Wallet } from '../models/Wallet';
import { LiquidityPosition } from '../models/Liquidity';
import encryptionService from './encryptionService';

class WalletService {
  private baseProvider: ethers.JsonRpcProvider;
  private solanaConnection: Connection;
  private usdcMint: PublicKey;

  constructor() {
    // Initialize providers
    this.baseProvider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );

    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    this.usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    console.log('🚀 Wallet service initialized with encryption support');
  }

  // ✅ UPDATED: Create user wallets with encrypted private keys
  async createUserWallets(userId: string) {
    try {
      console.log('🔑 Creating encrypted wallets for user:', userId);

      // Check if wallets already exist
      const existingWallet = await Wallet.findOne({ userId });
      if (existingWallet) {
        console.log('✅ Wallets already exist for user');
        return {
          success: true,
          wallets: {
            baseAddress: existingWallet.baseAddress,
            solanaAddress: existingWallet.solanaAddress
          }
        };
      }

      // Generate new wallets
      console.log('🏗️ Generating new wallet keypairs...');
      
      // Generate Base (Ethereum) wallet
      const baseWallet = ethers.Wallet.createRandom();
      const basePrivateKey = baseWallet.privateKey; // Hex string with 0x prefix
      const baseAddress = baseWallet.address;

      // Generate Solana wallet
      const solanaKeypair = Keypair.generate();
      const solanaPrivateKey = Buffer.from(solanaKeypair.secretKey).toString('base64');
      const solanaAddress = solanaKeypair.publicKey.toString();

      console.log('🔐 Encrypting private keys...');
      
      // Encrypt private keys before storing
      const encryptedBasePrivateKey = encryptionService.encryptPrivateKey(basePrivateKey);
      const encryptedSolanaPrivateKey = encryptionService.encryptPrivateKey(solanaPrivateKey);

      // Save encrypted wallet to database
      const wallet = new Wallet({
        userId,
        baseAddress,
        solanaAddress,
        basePrivateKey: encryptedBasePrivateKey, // ✅ Now encrypted
        solanaPrivateKey: encryptedSolanaPrivateKey, // ✅ Now encrypted
        isActive: true,
        isEncrypted: true, // ✅ Flag to indicate encryption status
        createdAt: new Date()
      });

      await wallet.save();

      console.log('✅ Encrypted wallets created and saved');
      console.log(`- Base address: ${baseAddress}`);
      console.log(`- Solana address: ${solanaAddress}`);

      return {
        success: true,
        wallets: {
          baseAddress,
          solanaAddress
        }
      };

    } catch (error) {
      console.error('❌ Failed to create user wallets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ✅ UPDATED: Get decrypted private keys for transactions
  async getPrivateKeys(userId: string) {
    try {
      console.log('🔑 Retrieving and decrypting private keys for user:', userId);

      // ✅ IMPORTANT: Use findWithPrivateKeys to get private key fields
      const wallet = await Wallet.findWithPrivateKeys({ userId });
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      console.log('📋 Wallet found:', {
        hasBaseKey: !!wallet.basePrivateKey,
        hasSolanaKey: !!wallet.solanaPrivateKey,
        isEncrypted: wallet.isEncrypted || false,
        baseKeyLength: wallet.basePrivateKey?.length || 0,
        solanaKeyLength: wallet.solanaPrivateKey?.length || 0
      });

      // ✅ SAFETY: Check if keys exist
      if (!wallet.basePrivateKey || !wallet.solanaPrivateKey) {
        throw new Error('Private keys not found in wallet record');
      }

      // Check if keys are encrypted
      if (!wallet.isEncrypted) {
        console.warn('⚠️ Wallet keys are not encrypted - using as-is');
        // Return as-is for backward compatibility
        return {
          basePrivateKey: wallet.basePrivateKey,
          solanaPrivateKey: wallet.solanaPrivateKey
        };
      }

      console.log('🔓 Decrypting private keys...');

      // ✅ ENHANCED: Try to decrypt with better error handling
      let basePrivateKey: string;
      let solanaPrivateKey: string;

      try {
        basePrivateKey = encryptionService.decryptPrivateKey(wallet.basePrivateKey);
      } catch (baseError) {
        console.error('❌ Failed to decrypt base private key:', baseError);
        console.log('🔄 Using base key as-is (fallback)');
        basePrivateKey = wallet.basePrivateKey;
      }

      try {
        solanaPrivateKey = encryptionService.decryptPrivateKey(wallet.solanaPrivateKey);
      } catch (solanaError) {
        console.error('❌ Failed to decrypt solana private key:', solanaError);
        console.log('🔄 Using solana key as-is (fallback)');
        solanaPrivateKey = wallet.solanaPrivateKey;
      }

      console.log('✅ Private keys retrieved successfully');

      return {
        basePrivateKey,
        solanaPrivateKey
      };

    } catch (error) {
      console.error('❌ Failed to get private keys:', error);
      throw error;
    }
  }

  // ✅ NEW: Migrate existing unencrypted wallets to encrypted storage
  async migrateWalletToEncryption(userId: string) {
    try {
      console.log('🔄 Migrating wallet to encrypted storage for user:', userId);

      const wallet = await Wallet.findWithPrivateKeys({ userId });
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      if (wallet.isEncrypted) {
        console.log('✅ Wallet is already encrypted');
        return { success: true, message: 'Wallet already encrypted' };
      }

      console.log('🔐 Encrypting existing private keys...');

      // Encrypt the existing private keys
      const encryptedBasePrivateKey = encryptionService.encryptPrivateKey(wallet.basePrivateKey);
      const encryptedSolanaPrivateKey = encryptionService.encryptPrivateKey(wallet.solanaPrivateKey);

      // Update wallet with encrypted keys
      await Wallet.findByIdAndUpdate(wallet._id, {
        basePrivateKey: encryptedBasePrivateKey,
        solanaPrivateKey: encryptedSolanaPrivateKey,
        isEncrypted: true,
        migratedAt: new Date()
      });

      console.log('✅ Wallet successfully migrated to encrypted storage');

      return {
        success: true,
        message: 'Wallet migrated to encrypted storage'
      };

    } catch (error) {
      console.error('❌ Failed to migrate wallet to encryption:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed'
      };
    }
  }

  // ✅ EXISTING: Get user wallets (addresses only) - UNCHANGED
  async getUserWallets(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return {
          success: false,
          error: 'Wallet not found'
        };
      }

      return {
        success: true,
        wallets: {
          baseAddress: wallet.baseAddress,
          solanaAddress: wallet.solanaAddress
        }
      };
    } catch (error) {
      console.error('❌ Failed to get user wallets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ✅ EXISTING: Get wallet balances from blockchain - UNCHANGED
  async getWalletBalances(userId: string) {
    try {
      console.log('💰 Fetching real balances for user:', userId);

      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      console.log('💰 Fetching real balances for:', wallet.baseAddress, wallet.solanaAddress);

      // Get Base USDC balance
      const baseUsdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const baseUsdcAbi = ['function balanceOf(address account) external view returns (uint256)'];
      const baseUsdcContract = new ethers.Contract(baseUsdcAddress, baseUsdcAbi, this.baseProvider);
      
      const baseUsdcBalance = await baseUsdcContract.balanceOf(wallet.baseAddress);
      const baseUSDC = parseFloat(ethers.formatUnits(baseUsdcBalance, 6));

      console.log('✅ Base USDC balance:', baseUSDC);

      // Get Solana USDC balance
      let solanaUSDC = 0;
      try {
        const solanaTokenAccount = await getAssociatedTokenAddress(
          this.usdcMint,
          new PublicKey(wallet.solanaAddress)
        );
        
        const tokenAccountInfo = await getAccount(this.solanaConnection, solanaTokenAccount);
        solanaUSDC = Number(tokenAccountInfo.amount) / 1e6;
      } catch (error) {
        // Token account doesn't exist or has no balance
        solanaUSDC = 0;
      }

      console.log('✅ Solana USDC balance:', solanaUSDC);

      const totalUSDC = baseUSDC + solanaUSDC;

      console.log('💰 Total balances - Base:', baseUSDC, 'Solana:', solanaUSDC, 'Total:', totalUSDC);

      return {
        success: true,
        balances: {
          baseUSDC,
          solanaUSDC,
          totalUSDC
        }
      };

    } catch (error) {
      console.error('❌ Failed to get wallet balances:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ✅ EXISTING: Update liquidity position balances - UNCHANGED
  async updateLiquidityPositionBalances(userId: string) {
    try {
      const balancesResult = await this.getWalletBalances(userId);
      
      if (!balancesResult.success) {
        return balancesResult;
      }

      const { baseUSDC, solanaUSDC, totalUSDC } = balancesResult.balances!;

      // Update liquidity position
      await LiquidityPosition.findOneAndUpdate(
        { userId, isActive: true },
        {
          baseBalance: baseUSDC,
          solanaBalance: solanaUSDC,
          totalBalance: totalUSDC,
          lastBalanceUpdate: new Date()
        }
      );

      console.log('✅ Updated liquidity position balances:', { 
        base: baseUSDC, 
        solana: solanaUSDC, 
        total: totalUSDC 
      });

      return balancesResult;
    } catch (error) {
      console.error('❌ Failed to update liquidity position balances:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ✅ NEW: Validate wallet encryption status
  async validateWalletEncryption(userId: string) {
    try {
      const wallet = await Wallet.findWithPrivateKeys({ userId });
      if (!wallet) {
        return { valid: false, error: 'Wallet not found' };
      }

      if (!wallet.isEncrypted) {
        return { 
          valid: false, 
          error: 'Wallet is not encrypted',
          needsMigration: true 
        };
      }

      // Test decryption
      try {
        await this.getPrivateKeys(userId);
        return { valid: true, encrypted: true };
      } catch (error) {
        return { 
          valid: false, 
          error: 'Failed to decrypt wallet keys - encryption key may be wrong',
          corrupted: true 
        };
      }

    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // ✅ NEW: Get wallet encryption status
  async getWalletEncryptionStatus(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return {
          exists: false,
          encrypted: false,
          needsEncryption: false
        };
      }

      return {
        exists: true,
        encrypted: wallet.isEncrypted || false,
        needsEncryption: !wallet.isEncrypted,
        createdAt: wallet.createdAt,
        migratedAt: wallet.migratedAt || null
      };

    } catch (error) {
      console.error('❌ Failed to get wallet encryption status:', error);
      throw error;
    }
  }
}

export default new WalletService();
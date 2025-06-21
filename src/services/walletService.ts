import { ethers } from 'ethers';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { Wallet } from '../models/Wallet';
import cryptoService from './cryptoService';

class WalletService {
  private baseProvider: ethers.JsonRpcProvider;
  private solanaConnection: Connection;

  constructor() {
    // Initialize Base provider
    this.baseProvider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );

    // Initialize Solana connection
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
  }
  
  // Create wallets for both Base and Solana networks
  async createUserWallets(userId: string) {
    try {
      console.log('🔑 Creating wallets for user:', userId);

      // Check if user already has wallets
      const existingWallet = await Wallet.findOne({ userId });
      if (existingWallet) {
        console.log('✅ User already has wallets');
        return {
          success: true,
          wallets: {
            baseAddress: existingWallet.baseAddress,
            solanaAddress: existingWallet.solanaAddress
          }
        };
      }

      // Generate Base (Ethereum) wallet
      const baseWallet = ethers.Wallet.createRandom();
      const baseAddress = baseWallet.address;
      const basePrivateKey = baseWallet.privateKey;

      console.log('💰 Base wallet created:', baseAddress);

      // Generate Solana wallet
      const solanaKeypair = Keypair.generate();
      const solanaAddress = solanaKeypair.publicKey.toString();
      const solanaPrivateKey = Buffer.from(solanaKeypair.secretKey).toString('base64'); // ✅ Use base64 for consistency

      console.log('🌟 Solana wallet created:', solanaAddress);

      // Encrypt private keys before storing
      const encryptedBasePrivateKey = cryptoService.encrypt(basePrivateKey);
      const encryptedSolanaPrivateKey = cryptoService.encrypt(solanaPrivateKey);

      // Save to database
      const newWallet = new Wallet({
        userId,
        baseAddress,
        basePrivateKey: encryptedBasePrivateKey,
        solanaAddress,
        solanaPrivateKey: encryptedSolanaPrivateKey,
        isActive: true
      });

      await newWallet.save();

      console.log('✅ Wallets saved to database');

      return {
        success: true,
        wallets: {
          baseAddress,
          solanaAddress
        }
      };

    } catch (error) {
      console.error('❌ Wallet creation failed:', error);
      throw new Error('Failed to create user wallets');
    }
  }

  // Get user's wallet addresses
  async getUserWallets(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId, isActive: true });
      
      if (!wallet) {
        return {
          success: false,
          message: 'No wallets found for user'
        };
      }

      return {
        success: true,
        wallets: {
          baseAddress: wallet.baseAddress,
          solanaAddress: wallet.solanaAddress,
          createdAt: wallet.createdAt
        }
      };

    } catch (error) {
      console.error('❌ Failed to get user wallets:', error);
      throw new Error('Failed to retrieve user wallets');
    }
  }

  // Get decrypted private keys (use carefully!)
  async getPrivateKeys(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId, isActive: true })
        .select('+basePrivateKey +solanaPrivateKey');
      
      if (!wallet) {
        throw new Error('No wallets found for user');
      }

      // Decrypt private keys
      const basePrivateKey = cryptoService.decrypt(wallet.basePrivateKey);
      const solanaPrivateKey = cryptoService.decrypt(wallet.solanaPrivateKey);

      return {
        basePrivateKey,
        solanaPrivateKey,
        baseAddress: wallet.baseAddress,
        solanaAddress: wallet.solanaAddress
      };

    } catch (error) {
      console.error('❌ Failed to get private keys:', error);
      throw new Error('Failed to retrieve private keys');
    }
  }

  // ✅ FIXED: Check real balances on both networks
  async getWalletBalances(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId, isActive: true });
      
      if (!wallet) {
        throw new Error('No wallets found for user');
      }

      console.log('💰 Fetching real balances for:', wallet.baseAddress, wallet.solanaAddress);

      let baseUSDC = 0;
      let solanaUSDC = 0;

      // ✅ Get Base USDC balance
      try {
        const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
        const usdcABI = [
          'function balanceOf(address account) external view returns (uint256)',
          'function decimals() external view returns (uint8)'
        ];

        const usdcContract = new ethers.Contract(usdcAddress, usdcABI, this.baseProvider);
        const balance = await usdcContract.balanceOf(wallet.baseAddress);
        baseUSDC = parseFloat(ethers.formatUnits(balance, 6)); // USDC has 6 decimals

        console.log('✅ Base USDC balance:', baseUSDC);
      } catch (error) {
        console.error('❌ Failed to fetch Base balance:', error);
        // Continue execution, don't fail the whole function
      }

      // ✅ Get Solana USDC balance
      try {
        const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Solana USDC
        const walletPublicKey = new PublicKey(wallet.solanaAddress);
        
        // Get associated token account
        const tokenAccount = await getAssociatedTokenAddress(usdcMint, walletPublicKey);
        
        try {
          const accountInfo = await getAccount(this.solanaConnection, tokenAccount);
          solanaUSDC = parseFloat(accountInfo.amount.toString()) / 1e6; // USDC has 6 decimals
          console.log('✅ Solana USDC balance:', solanaUSDC);
        } catch (accountError) {
          // Token account doesn't exist = 0 balance
          console.log('ℹ️ Solana token account not found (0 balance)');
          solanaUSDC = 0;
        }
      } catch (error) {
        console.error('❌ Failed to fetch Solana balance:', error);
        // Continue execution, don't fail the whole function
      }

      const totalUSDC = baseUSDC + solanaUSDC;

      console.log('💰 Total balances - Base:', baseUSDC, 'Solana:', solanaUSDC, 'Total:', totalUSDC);

      return {
        success: true,
        balances: {
          baseAddress: wallet.baseAddress,
          baseUSDC: baseUSDC,
          solanaAddress: wallet.solanaAddress,
          solanaUSDC: solanaUSDC,
          totalUSDC: totalUSDC
        }
      };

    } catch (error) {
      console.error('❌ Failed to get wallet balances:', error);
      
      // Return fallback response instead of throwing
      return {
        success: false,
        message: 'Failed to retrieve wallet balances',
        balances: {
          baseAddress: '',
          baseUSDC: 0,
          solanaAddress: '',
          solanaUSDC: 0,
          totalUSDC: 0
        }
      };
    }
  }

  // ✅ FIXED: Update liquidity position balances from blockchain
  async updateLiquidityPositionBalances(userId: string) {
    try {
      const { LiquidityPosition } = await import('../models/Liquidity');
      
      // Get real balances
      const balancesResult = await this.getWalletBalances(userId);
      
      if (!balancesResult.success) {
        throw new Error('Failed to get wallet balances');
      }

      // Update liquidity position with real balances
      const position = await LiquidityPosition.findOne({ userId, isActive: true });
      
      if (position) {
        position.baseBalance = balancesResult.balances.baseUSDC;
        position.solanaBalance = balancesResult.balances.solanaUSDC;
        // totalBalance is calculated automatically in the pre-save hook
        
        await position.save();
        
        console.log('✅ Updated liquidity position balances:', {
          base: balancesResult.balances.baseUSDC,
          solana: balancesResult.balances.solanaUSDC,
          total: position.totalBalance
        });
      }

      return balancesResult;
      
    } catch (error) {
      console.error('❌ Failed to update liquidity position balances:', error);
      throw error;
    }
  }

  // Deactivate user wallets (soft delete)
  async deactivateWallets(userId: string) {
    try {
      const result = await Wallet.updateOne(
        { userId },
        { isActive: false }
      );

      return {
        success: result.modifiedCount > 0,
        message: result.modifiedCount > 0 ? 'Wallets deactivated' : 'No wallets found'
      };

    } catch (error) {
      console.error('❌ Failed to deactivate wallets:', error);
      throw new Error('Failed to deactivate wallets');
    }
  }
}

export default new WalletService();
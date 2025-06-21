import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { Wallet } from '../models/Wallet';
import cryptoService from './cryptoService';

class WalletService {
  
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
      const solanaPrivateKey = Buffer.from(solanaKeypair.secretKey).toString('hex');

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

  // Check balances on both networks
  async getWalletBalances(userId: string) {
    try {
      const wallet = await Wallet.findOne({ userId, isActive: true });
      
      if (!wallet) {
        throw new Error('No wallets found for user');
      }

      // Base USDC balance (placeholder - you'll need to implement actual balance checking)
      // const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
      // const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, baseProvider);
      // const baseBalance = await usdcContract.balanceOf(wallet.baseAddress);

      // Solana USDC balance (placeholder)
      // const connection = new Connection(process.env.SOLANA_RPC_URL);
      // const solanaBalance = await connection.getTokenAccountBalance(...);

      // For now, return mock data
      return {
        success: true,
        balances: {
          baseAddress: wallet.baseAddress,
          baseUSDC: 0, // Will be implemented with actual RPC calls
          solanaAddress: wallet.solanaAddress,
          solanaUSDC: 0, // Will be implemented with actual RPC calls
          totalUSDC: 0
        }
      };

    } catch (error) {
      console.error('❌ Failed to get wallet balances:', error);
      throw new Error('Failed to retrieve wallet balances');
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
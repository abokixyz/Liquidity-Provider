import { ethers } from 'ethers';
import { Connection, Keypair, Transaction as SolanaTransaction, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import walletService from './walletService';
import { Transaction } from '../models/Transaction'; // ✅ FIXED: Named import

class GaslessService {
  private baseProvider: ethers.JsonRpcProvider;
  private solanaConnection: Connection;
  private relayerBaseWallet!: ethers.Wallet;
  private relayerSolanaWallet!: Keypair;

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

    // Initialize relayer wallets - Fixed to use the correct env var
    if (process.env.RELAYER_PRIVATE_KEY) {
      this.relayerBaseWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, this.baseProvider);
    }

    if (process.env.SOLANA_RELAYER_PRIVATE_KEY) {
      // ✅ FIXED: Use Base64 decoding for Solana private key
      const privateKeyBytes = new Uint8Array(Buffer.from(process.env.SOLANA_RELAYER_PRIVATE_KEY, 'base64'));
      this.relayerSolanaWallet = Keypair.fromSecretKey(privateKeyBytes);
    }

    console.log('🚀 Gasless service initialized');
    console.log('- Base relayer:', this.relayerBaseWallet?.address);
    console.log('- Solana relayer:', this.relayerSolanaWallet?.publicKey.toString());
  }

  // Execute gasless USDC transfer on Base network
  async executeBaseGaslessTransfer(
    userId: string,
    destinationAddress: string,
    amountUSDC: number,
    transactionId: string
  ) {
    try {
      console.log('⚡ Starting Base gasless transfer...');
      console.log(`- Amount: ${amountUSDC} USDC`);
      console.log(`- Destination: ${destinationAddress}`);

      // Get user's private keys
      const userKeys = await walletService.getPrivateKeys(userId);
      const userWallet = new ethers.Wallet(userKeys.basePrivateKey, this.baseProvider);

      // USDC contract on Base
      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const usdcABI = [
        'function transfer(address to, uint256 amount) external returns (bool)',
        'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
        'function balanceOf(address account) external view returns (uint256)',
        'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
        'function nonces(address owner) external view returns (uint256)',
        'function decimals() external view returns (uint8)',
        'function name() external view returns (string)',
        'function version() external view returns (string)'
      ];

      const usdc = new ethers.Contract(usdcAddress, usdcABI, this.baseProvider);
      const transferAmount = ethers.parseUnits(amountUSDC.toString(), 6);

      // Check user's USDC balance
      const userBalance = await usdc.balanceOf(userWallet.address);
      if (userBalance < transferAmount) {
        throw new Error(`Insufficient USDC balance. Have: ${ethers.formatUnits(userBalance, 6)}, Need: ${amountUSDC}`);
      }

      // Step 1: Create EIP-712 domain for USDC permit
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 8453, // Base mainnet
        verifyingContract: usdcAddress
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      // Step 2: Get current nonce and set deadline
      const nonce = await usdc.nonces(userWallet.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      // Step 3: Create permit message
      const permitMessage = {
        owner: userWallet.address,
        spender: this.relayerBaseWallet.address,
        value: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      console.log('✍️ User signing permit (gasless)...');

      // Step 4: User signs permit (OFF-CHAIN, NO GAS!)
      const signature = await userWallet.signTypedData(domain, types, permitMessage);
      const { v, r, s } = ethers.Signature.from(signature);

      // Step 5: Relayer executes permit and transfer (PAYS GAS)
      console.log('🤖 Relayer executing permit...');
      const usdcWithRelayer = new ethers.Contract(usdcAddress, usdcABI, this.relayerBaseWallet);

      const permitTx = await usdcWithRelayer.permit(
        userWallet.address,
        this.relayerBaseWallet.address,
        transferAmount,
        deadline,
        v,
        r,
        s,
        { gasLimit: 120000 }
      );

      await permitTx.wait();
      console.log(`✅ Permit executed: ${permitTx.hash}`);

      // Step 6: Execute transferFrom
      console.log('💸 Relayer executing transfer...');
      const transferTx = await usdcWithRelayer.transferFrom(
        userWallet.address,
        destinationAddress,
        transferAmount,
        { gasLimit: 80000 }
      );

      const transferReceipt = await transferTx.wait();
      console.log(`✅ Transfer completed: ${transferTx.hash}`);

      // Update transaction record - ✅ FIXED: Use named import
      await Transaction.findByIdAndUpdate(transactionId, {
        txHash: transferTx.hash,
        fromAddress: userWallet.address,
        toAddress: destinationAddress,
        gasFeePaidBy: this.relayerBaseWallet.address,
        status: 'confirmed',
        confirmedAt: new Date()
      });

      return {
        success: true,
        txHash: transferTx.hash,
        permitHash: permitTx.hash,
        amount: amountUSDC,
        network: 'base',
        gasFeePaidBy: this.relayerBaseWallet.address,
        explorerUrl: `https://basescan.org/tx/${transferTx.hash}`
      };

    } catch (error) {
      console.error('❌ Base gasless transfer failed:', error);
      
      // Update transaction as failed - ✅ FIXED: Use named import
      await Transaction.findByIdAndUpdate(transactionId, {
        status: 'failed',
        failureReason: (error instanceof Error ? error.message : 'Unknown error')
      });

      throw error;
    }
  }

  // Execute gasless USDC transfer on Solana network
  async executeSolanaGaslessTransfer(
    userId: string,
    destinationAddress: string,
    amountUSDC: number,
    transactionId: string
  ) {
    try {
      console.log('⚡ Starting Solana gasless transfer...');
      console.log(`- Amount: ${amountUSDC} USDC`);
      console.log(`- Destination: ${destinationAddress}`);

      // Get user's private keys
      const userKeys = await walletService.getPrivateKeys(userId);
      // ✅ FIXED: Assume the private key is already in the correct format
      const userSolanaPrivateKey = Buffer.from(userKeys.solanaPrivateKey, 'base64');
      const userKeypair = Keypair.fromSecretKey(new Uint8Array(userSolanaPrivateKey));

      // USDC mint on Solana
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const destinationPublicKey = new PublicKey(destinationAddress);

      // Get token accounts
      const sourceTokenAccount = await getAssociatedTokenAddress(usdcMint, userKeypair.publicKey);
      const destinationTokenAccount = await getAssociatedTokenAddress(usdcMint, destinationPublicKey);

      const transferAmount = Math.floor(amountUSDC * 1e6); // Convert to lamports

      console.log('📝 Creating transfer instruction...');

      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        sourceTokenAccount,
        destinationTokenAccount,
        userKeypair.publicKey, // User authorizes transfer
        transferAmount,
        [],
        TOKEN_PROGRAM_ID
      );

      // Build transaction with relayer as fee payer
      const transaction = new SolanaTransaction().add(transferInstruction);
      transaction.feePayer = this.relayerSolanaWallet.publicKey; // RELAYER PAYS GAS!

      // Get recent blockhash
      const { blockhash } = await this.solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      console.log('✍️ Signing transaction...');

      // Both wallets sign: user for authorization, relayer for gas fees
      transaction.partialSign(userKeypair); // User authorizes token transfer
      transaction.partialSign(this.relayerSolanaWallet); // Relayer pays gas

      console.log('📡 Sending transaction...');

      // Send transaction
      const signature = await this.solanaConnection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Confirm transaction
      const confirmation = await this.solanaConnection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log(`✅ Solana transfer completed: ${signature}`);

      // Update transaction record - ✅ FIXED: Use named import
      await Transaction.findByIdAndUpdate(transactionId, {
        txHash: signature,
        fromAddress: userKeypair.publicKey.toString(),
        toAddress: destinationAddress,
        gasFeePaidBy: this.relayerSolanaWallet.publicKey.toString(),
        status: 'confirmed',
        confirmedAt: new Date()
      });

      return {
        success: true,
        txHash: signature,
        amount: amountUSDC,
        network: 'solana',
        gasFeePaidBy: this.relayerSolanaWallet.publicKey.toString(),
        explorerUrl: `https://solscan.io/tx/${signature}`
      };

    } catch (error) {
      console.error('❌ Solana gasless transfer failed:', error);
      
      // Update transaction as failed - ✅ FIXED: Use named import
      await Transaction.findByIdAndUpdate(transactionId, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  // Main function to execute gasless transfers
  async executeGaslessTransfer(
    userId: string,
    network: 'base' | 'solana',
    destinationAddress: string,
    amountUSDC: number,
    transactionId: string
  ) {
    try {
      console.log(`🚀 Executing gasless transfer on ${network}...`);

      if (network === 'base') {
        return await this.executeBaseGaslessTransfer(userId, destinationAddress, amountUSDC, transactionId);
      } else if (network === 'solana') {
        return await this.executeSolanaGaslessTransfer(userId, destinationAddress, amountUSDC, transactionId);
      } else {
        throw new Error(`Unsupported network: ${network}`);
      }

    } catch (error) {
      console.error('❌ Gasless transfer failed:', error);
      throw error;
    }
  }

  // Check if gasless service is properly configured
  isConfigured(): boolean {
    const baseConfigured = !!(this.relayerBaseWallet && process.env.ALCHEMY_API_KEY);
    const solanaConfigured = !!(this.relayerSolanaWallet && process.env.SOLANA_RPC_URL);
    
    return baseConfigured && solanaConfigured;
  }

  // Get service status
  getServiceStatus() {
    return {
      configured: this.isConfigured(),
      networks: {
        base: {
          configured: !!(this.relayerBaseWallet && process.env.ALCHEMY_API_KEY),
          relayerAddress: this.relayerBaseWallet?.address
        },
        solana: {
          configured: !!(this.relayerSolanaWallet && process.env.SOLANA_RPC_URL),
          relayerAddress: this.relayerSolanaWallet?.publicKey.toString()
        }
      }
    };
  }
}

export default new GaslessService();
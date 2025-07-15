import { ethers } from 'ethers';
import { 
  Connection, 
  Keypair, 
  Transaction as SolanaTransaction, 
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram
} from '@solana/web3.js';
import { 
  createTransferInstruction, 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import walletService from './walletService';
import { Transaction } from '../models/Transaction';

class GaslessService {
  private baseProvider: ethers.JsonRpcProvider;
  private solanaConnection: Connection;
  private relayerBaseWallet!: ethers.Wallet;
  private relayerSolanaWallet!: Keypair;
  private usdcMint: PublicKey;

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

    // USDC mint address for Solana mainnet
    this.usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    // Initialize relayer wallets with validation
    try {
      if (process.env.RELAYER_PRIVATE_KEY) {
        this.relayerBaseWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, this.baseProvider);
        console.log('✅ Base relayer wallet initialized:', this.relayerBaseWallet.address);
      } else {
        console.warn('⚠️ RELAYER_PRIVATE_KEY not configured');
      }

      if (process.env.SOLANA_RELAYER_PRIVATE_KEY) {
        const privateKeyBytes = new Uint8Array(Buffer.from(process.env.SOLANA_RELAYER_PRIVATE_KEY, 'base64'));
        this.relayerSolanaWallet = Keypair.fromSecretKey(privateKeyBytes);
        console.log('✅ Solana relayer wallet initialized:', this.relayerSolanaWallet.publicKey.toString());
      } else {
        console.warn('⚠️ SOLANA_RELAYER_PRIVATE_KEY not configured');
      }
    } catch (error) {
      console.error('❌ Failed to initialize relayer wallets:', error);
    }

    console.log('🚀 Gasless service initialized');
  }

  // ✅ NEW: Execute gasless USDC transfer on Solana network
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

      // ✅ VALIDATION: Check if Solana relayer wallet is configured
      if (!this.relayerSolanaWallet) {
        throw new Error('Solana relayer wallet not configured. Check SOLANA_RELAYER_PRIVATE_KEY environment variable.');
      }

      // Get user's private keys
      const userKeys = await walletService.getPrivateKeys(userId);
      if (!userKeys.solanaPrivateKey) {
        throw new Error('User Solana private key not found');
      }

      // Create user wallet from private key
      const userWallet = Keypair.fromSecretKey(
        new Uint8Array(Buffer.from(userKeys.solanaPrivateKey, 'base64'))
      );

      console.log('👤 User wallet:', userWallet.publicKey.toString());
      console.log('🤖 Relayer wallet:', this.relayerSolanaWallet.publicKey.toString());

      // Convert destination address to PublicKey
      const destinationPublicKey = new PublicKey(destinationAddress);

      // Get token accounts
      const sourceTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        userWallet.publicKey
      );

      const destinationTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        destinationPublicKey
      );

      console.log(`📤 Source Token Account: ${sourceTokenAccount.toString()}`);
      console.log(`📥 Destination Token Account: ${destinationTokenAccount.toString()}`);

      // ✅ VALIDATION: Check user's USDC balance
      console.log('💰 Checking user USDC balance...');
      let userTokenAccountInfo;
      try {
        userTokenAccountInfo = await getAccount(this.solanaConnection, sourceTokenAccount);
        const userBalance = Number(userTokenAccountInfo.amount) / 1e6; // USDC has 6 decimals
        
        console.log(`💰 User balance: ${userBalance} USDC`);
        console.log(`💸 Transfer amount: ${amountUSDC} USDC`);

        if (userBalance < amountUSDC) {
          throw new Error(`Insufficient USDC balance. Have: ${userBalance} USDC, Need: ${amountUSDC} USDC`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('could not find account')) {
          throw new Error('User does not have a USDC token account or balance is zero');
        }
        throw error;
      }

      // ✅ VALIDATION: Check relayer SOL balance for gas fees
      const relayerSolBalance = await this.solanaConnection.getBalance(this.relayerSolanaWallet.publicKey);
      const relayerSolFormatted = relayerSolBalance / 1e9;
      
      console.log(`⛽ Relayer SOL balance: ${relayerSolFormatted} SOL`);
      
      // Check if relayer has enough SOL for transaction fees
      const minimumSolRequired = 0.001; // Conservative estimate for Solana transaction fees
      if (relayerSolFormatted < minimumSolRequired) {
        throw new Error(`Insufficient relayer SOL balance for gas fees. Have: ${relayerSolFormatted} SOL, Need: at least ${minimumSolRequired} SOL`);
      }

      // ✅ CHECK: Verify destination token account exists, create if not
      let needsDestinationAccount = false;
      try {
        await getAccount(this.solanaConnection, destinationTokenAccount);
        console.log('✅ Destination token account exists');
      } catch (error) {
        console.log('⚠️ Destination token account does not exist - will create it');
        needsDestinationAccount = true;
      }

      // Calculate transfer amount in lamports (USDC has 6 decimals)
      const transferAmount = Math.floor(amountUSDC * 1e6);
      console.log(`💰 Transfer amount: ${transferAmount} lamports (${amountUSDC} USDC)`);

      // Build transaction
      const transaction = new SolanaTransaction();

      // Add instruction to create destination token account if needed
      if (needsDestinationAccount) {
        console.log('🏗️ Adding instruction to create destination token account...');
        const createAccountInstruction = createAssociatedTokenAccountInstruction(
          this.relayerSolanaWallet.publicKey, // Payer (relayer pays for account creation)
          destinationTokenAccount,
          destinationPublicKey, // Owner
          this.usdcMint // Mint
        );
        transaction.add(createAccountInstruction);
      }

      // Add transfer instruction
      console.log('💸 Adding USDC transfer instruction...');
      const transferInstruction = createTransferInstruction(
        sourceTokenAccount,
        destinationTokenAccount,
        userWallet.publicKey, // User authorizes the transfer
        transferAmount,
        [],
        TOKEN_PROGRAM_ID
      );
      transaction.add(transferInstruction);

      // ✅ CRITICAL: Set relayer as fee payer (this is what makes it gasless for the user)
      transaction.feePayer = this.relayerSolanaWallet.publicKey;

      // Get recent blockhash
      console.log('🔗 Getting recent blockhash...');
      const { blockhash } = await this.solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      console.log('📝 Transaction created with relayer as fee payer');

      // ✅ CRITICAL: Both wallets must sign the transaction
      // 1. User wallet signs to authorize token transfer
      // 2. Relayer wallet signs to pay gas fees and account creation (if needed)
      console.log('✍️ Signing transaction...');
      transaction.partialSign(userWallet);     // Authorizes token transfer
      transaction.partialSign(this.relayerSolanaWallet); // Pays gas fees

      console.log('✅ Transaction signed by both wallets');

      // ✅ ESTIMATE: Calculate transaction fee before sending
      let estimatedFee = 0;
      try {
        const feeForMessage = await this.solanaConnection.getFeeForMessage(
          transaction.compileMessage(),
          'confirmed'
        );
        estimatedFee = feeForMessage.value || 5000; // Fallback to 5000 lamports
        console.log(`💰 Estimated transaction fee: ${estimatedFee} lamports (${estimatedFee / 1e9} SOL)`);
      } catch (feeError) {
        console.warn('⚠️ Could not estimate fee, using default');
        estimatedFee = 5000;
      }

      // Send transaction
      console.log('📡 Sending transaction to Solana network...');
      const signature = await this.solanaConnection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        }
      );

      console.log(`📜 Transaction sent: ${signature}`);

      // Confirm transaction
      console.log('⏳ Confirming transaction...');
      const confirmation = await this.solanaConnection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ SOLANA TRANSACTION CONFIRMED!');
      console.log(`🔗 Explorer: https://solscan.io/tx/${signature}`);

      // Update transaction record
      await Transaction.findByIdAndUpdate(transactionId, {
        txHash: signature,
        fromAddress: userWallet.publicKey.toString(),
        toAddress: destinationAddress,
        gasFeePaidBy: this.relayerSolanaWallet.publicKey.toString(),
        status: 'confirmed',
        confirmedAt: new Date()
      });

      // Calculate approximate cost in USD (assuming $200/SOL for estimation)
      const estimatedCostSOL = estimatedFee / 1e9;
      const estimatedCostUSD = estimatedCostSOL * 200;

      return {
        success: true,
        txHash: signature,
        amount: amountUSDC,
        network: 'solana',
        gasFeePaidBy: this.relayerSolanaWallet.publicKey.toString(),
        gasCostSOL: estimatedCostSOL,
        gasCostUSD: estimatedCostUSD,
        destinationAccountCreated: needsDestinationAccount,
        explorerUrl: `https://solscan.io/tx/${signature}`
      };

    } catch (error) {
      console.error('❌ Solana gasless transfer failed:', error);
      
      // Update transaction as failed
      await Transaction.findByIdAndUpdate(transactionId, {
        status: 'failed',
        failureReason: (error instanceof Error ? error.message : 'Unknown error')
      });

      throw error;
    }
  }

  // ✅ EXISTING: Execute gasless USDC transfer on Base network (keeping existing implementation)
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

      // ✅ VALIDATION: Check if relayer wallet is configured
      if (!this.relayerBaseWallet) {
        throw new Error('Base relayer wallet not configured. Check RELAYER_PRIVATE_KEY environment variable.');
      }

      // Get user's private keys
      const userKeys = await walletService.getPrivateKeys(userId);
      const userWallet = new ethers.Wallet(userKeys.basePrivateKey, this.baseProvider);

      console.log('👤 User wallet:', userWallet.address);
      console.log('🤖 Relayer wallet:', this.relayerBaseWallet.address);

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
        'function version() external view returns (string)',
        'function DOMAIN_SEPARATOR() external view returns (bytes32)'
      ];

      const usdc = new ethers.Contract(usdcAddress, usdcABI, this.baseProvider);
      const transferAmount = ethers.parseUnits(amountUSDC.toString(), 6);

      // ✅ VALIDATION: Check user's USDC balance
      console.log('💰 Checking user USDC balance...');
      const userBalance = await usdc.balanceOf(userWallet.address);
      const userBalanceFormatted = parseFloat(ethers.formatUnits(userBalance, 6));
      
      console.log(`💰 User balance: ${userBalanceFormatted} USDC`);
      console.log(`💸 Transfer amount: ${amountUSDC} USDC`);

      if (userBalance < transferAmount) {
        throw new Error(`Insufficient USDC balance. Have: ${userBalanceFormatted} USDC, Need: ${amountUSDC} USDC`);
      }

      // ✅ VALIDATION: Check relayer ETH balance
      const relayerEthBalance = await this.baseProvider.getBalance(this.relayerBaseWallet.address);
      const relayerEthFormatted = parseFloat(ethers.formatEther(relayerEthBalance));
      
      console.log(`⛽ Relayer ETH balance: ${relayerEthFormatted} ETH`);
      
      // Conservative gas estimation
      const minimumRequired = 0.00005; // 0.00005 ETH
      if (relayerEthFormatted < minimumRequired) {
        throw new Error(`Insufficient relayer ETH balance for gas fees. Have: ${relayerEthFormatted} ETH, Need: at least ${minimumRequired} ETH`);
      }

      // Get domain information from contract
      console.log('🔍 Fetching contract domain information...');
      const contractName = await usdc.name();
      const contractVersion = await usdc.version();
      
      const domain = {
        name: contractName,
        version: contractVersion,
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

      // Get current nonce and set deadline
      const nonce = await usdc.nonces(userWallet.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      console.log(`📝 Permit details:`);
      console.log(`  - Nonce: ${nonce}`);
      console.log(`  - Deadline: ${deadline}`);

      // Create permit message
      const permitMessage = {
        owner: userWallet.address,
        spender: this.relayerBaseWallet.address,
        value: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      console.log('✍️ User signing permit (gasless)...');

      // User signs permit (OFF-CHAIN, NO GAS!)
      const signature = await userWallet.signTypedData(domain, types, permitMessage);
      const { v, r, s } = ethers.Signature.from(signature);

      console.log('✅ Permit signature created');

      // Relayer executes permit and transfer (PAYS GAS)
      console.log('🤖 Relayer executing permit...');
      const usdcWithRelayer = new ethers.Contract(usdcAddress, usdcABI, this.relayerBaseWallet);

      // Execute permit
      const permitTx = await usdcWithRelayer.permit(
        userWallet.address,
        this.relayerBaseWallet.address,
        transferAmount,
        deadline,
        v,
        r,
        s,
        { 
          gasLimit: 100000,
          type: 2
        }
      );

      console.log(`🚀 Permit transaction sent: ${permitTx.hash}`);
      
      const permitReceipt = await permitTx.wait();
      console.log(`✅ Permit executed: ${permitTx.hash}`);

      if (permitReceipt?.status !== 1) {
        throw new Error(`Permit transaction failed with status: ${permitReceipt?.status}`);
      }

      // Execute transferFrom
      console.log('💸 Relayer executing transfer...');
      const transferTx = await usdcWithRelayer.transferFrom(
        userWallet.address,
        destinationAddress,
        transferAmount,
        { 
          gasLimit: 70000,
          type: 2
        }
      );

      const transferReceipt = await transferTx.wait();
      console.log(`✅ Transfer completed: ${transferTx.hash}`);

      // Calculate total gas cost
      const totalGasUsed = (permitReceipt?.gasUsed || 0n) + (transferReceipt?.gasUsed || 0n);
      const gasPrice = permitReceipt?.gasPrice || transferReceipt?.gasPrice || 0n;
      const totalGasCost = totalGasUsed * gasPrice;
      const totalCostInEth = parseFloat(ethers.formatEther(totalGasCost));
      
      console.log(`💰 Total gas cost: ${totalCostInEth.toFixed(8)} ETH`);

      // Update transaction record
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
        gasCostETH: totalCostInEth,
        gasCostUSD: totalCostInEth * 3300, // Approximate ETH price
        explorerUrl: `https://basescan.org/tx/${transferTx.hash}`
      };

    } catch (error) {
      console.error('❌ Base gasless transfer failed:', error);
      
      // Update transaction as failed
      await Transaction.findByIdAndUpdate(transactionId, {
        status: 'failed',
        failureReason: (error instanceof Error ? error.message : 'Unknown error')
      });

      throw error;
    }
  }

  // ✅ UPDATED: Main function to execute gasless transfers (now supports both networks)
  async executeGaslessTransfer(
    userId: string,
    network: 'base' | 'solana',
    destinationAddress: string,
    amountUSDC: number,
    transactionId: string
  ) {
    try {
      console.log(`🚀 Executing gasless transfer on ${network}...`);

      // ✅ VALIDATION: Check service configuration
      if (!this.isConfigured(network)) {
        throw new Error(`${network} gasless service not properly configured`);
      }

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

  // ✅ UPDATED: Check if gasless service is properly configured for specific network
  isConfigured(network?: 'base' | 'solana'): boolean {
    const baseConfigured = !!(this.relayerBaseWallet && process.env.ALCHEMY_API_KEY);
    const solanaConfigured = !!(this.relayerSolanaWallet && process.env.SOLANA_RPC_URL);
    
    console.log('🔧 Service configuration:', {
      baseConfigured,
      solanaConfigured,
      hasRelayerBaseWallet: !!this.relayerBaseWallet,
      hasRelayerSolanaWallet: !!this.relayerSolanaWallet,
      hasAlchemyKey: !!process.env.ALCHEMY_API_KEY,
      hasSolanaRpc: !!process.env.SOLANA_RPC_URL
    });
    
    if (network === 'base') return baseConfigured;
    if (network === 'solana') return solanaConfigured;
    
    return baseConfigured || solanaConfigured; // At least one network configured
  }

  // ✅ UPDATED: Get real-time relayer balance info for both networks
  async getRelayerBalanceInfo() {
    try {
      const balanceInfo: any = {
        base: { configured: false },
        solana: { configured: false }
      };

      // Base network balance info
      if (this.relayerBaseWallet) {
        const balance = await this.baseProvider.getBalance(this.relayerBaseWallet.address);
        const balanceETH = parseFloat(ethers.formatEther(balance));
        
        // Estimate how many transactions this can afford
        const feeData = await this.baseProvider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits('0.001', 'gwei');
        const estimatedGasCost = parseFloat(ethers.formatEther(gasPrice * 300000n));
        const transactionsAffordable = Math.floor(balanceETH / estimatedGasCost);

        balanceInfo.base = {
          configured: true,
          address: this.relayerBaseWallet.address,
          balance: balanceETH,
          balanceFormatted: `${balanceETH.toFixed(8)} ETH`,
          estimatedTransactionsAffordable: transactionsAffordable,
          status: balanceETH > 0.00001 ? 'healthy' : 'low',
          needsFunding: balanceETH < 0.00001
        };
      }

      // Solana network balance info
      if (this.relayerSolanaWallet) {
        const balance = await this.solanaConnection.getBalance(this.relayerSolanaWallet.publicKey);
        const balanceSOL = balance / 1e9;
        
        // Estimate transactions (assuming 0.000005 SOL per transaction)
        const estimatedCostPerTx = 0.000005;
        const transactionsAffordable = Math.floor(balanceSOL / estimatedCostPerTx);

        balanceInfo.solana = {
          configured: true,
          address: this.relayerSolanaWallet.publicKey.toString(),
          balance: balanceSOL,
          balanceFormatted: `${balanceSOL.toFixed(8)} SOL`,
          estimatedTransactionsAffordable: transactionsAffordable,
          status: balanceSOL > 0.001 ? 'healthy' : 'low',
          needsFunding: balanceSOL < 0.001
        };
      }

      return balanceInfo;
    } catch (error) {
      console.error('❌ Failed to get relayer balance info:', error);
      throw error;
    }
  }

  // ✅ UPDATED: Get service status with enhanced information for both networks
  async getServiceStatus() {
    try {
      const balanceInfo = await this.getRelayerBalanceInfo();
      
      return {
        configured: this.isConfigured(),
        networks: {
          base: {
            configured: !!(this.relayerBaseWallet && process.env.ALCHEMY_API_KEY),
            relayerAddress: this.relayerBaseWallet?.address || 'Not configured',
            ...balanceInfo.base
          },
          solana: {
            configured: !!(this.relayerSolanaWallet && process.env.SOLANA_RPC_URL),
            relayerAddress: this.relayerSolanaWallet?.publicKey.toString() || 'Not configured',
            ...balanceInfo.solana
          }
        },
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get service status:', error);
      return {
        configured: this.isConfigured(),
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString()
      };
    }
  }

  // ✅ NEW: Test Solana transfer (for debugging)
  async testSolanaTransfer(userId: string, testAmount: number = 0.01) {
    try {
      console.log('🧪 Testing Solana transfer capabilities...');
      
      if (!this.relayerSolanaWallet) {
        throw new Error('Solana relayer wallet not configured');
      }

      const userKeys = await walletService.getPrivateKeys(userId);
      if (!userKeys.solanaPrivateKey) {
        throw new Error('User Solana private key not found');
      }

      const userWallet = Keypair.fromSecretKey(
        new Uint8Array(Buffer.from(userKeys.solanaPrivateKey, 'base64'))
      );
      
      // Get token account
      const sourceTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        userWallet.publicKey
      );
      
      console.log('📋 Test Info:');
      console.log(`  - User wallet: ${userWallet.publicKey.toString()}`);
      console.log(`  - Relayer wallet: ${this.relayerSolanaWallet.publicKey.toString()}`);
      console.log(`  - USDC token account: ${sourceTokenAccount.toString()}`);
      console.log(`  - Test amount: ${testAmount} USDC`);
      
      // Check balances
      try {
        const tokenAccountInfo = await getAccount(this.solanaConnection, sourceTokenAccount);
        const balance = Number(tokenAccountInfo.amount) / 1e6;
        console.log(`  - Current USDC balance: ${balance} USDC`);
        
        const solBalance = await this.solanaConnection.getBalance(this.relayerSolanaWallet.publicKey);
        console.log(`  - Relayer SOL balance: ${solBalance / 1e9} SOL`);
        
        return {
          success: true,
          userWallet: userWallet.publicKey.toString(),
          relayerWallet: this.relayerSolanaWallet.publicKey.toString(),
          usdcBalance: balance,
          relayerSolBalance: solBalance / 1e9,
          canTransfer: balance >= testAmount && solBalance > 5000
        };
        
      } catch (error) {
        console.log('  - USDC balance: 0 USDC (no token account)');
        return {
          success: false,
          error: 'No USDC token account found'
        };
      }
      
    } catch (error) {
      console.error('❌ Solana transfer test failed:', error);
      throw error;
    }
  }
}

export default new GaslessService();
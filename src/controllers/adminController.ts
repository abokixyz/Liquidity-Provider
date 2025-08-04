import { Request, Response } from 'express';
import { LiquidityPosition } from '../models/Liquidity';
import { User, IUser } from '../models/User';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import walletService from '../services/walletService';
import { PipelineStage } from 'mongoose';

interface AuthRequest extends Request {
  user?: IUser;
}

export const getAllLiquidityProviders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        minBalance,
        maxBalance,
        network = 'total',
        liquidityType,
        isVerified,
        isActive,
        sortBy = 'totalBalance',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
        search
      } = req.query;
  
      console.log('🔍 Admin fetching liquidity providers with filters:', {
        minBalance,
        maxBalance,
        network,
        liquidityType,
        isVerified,
        isActive,
        sortBy,
        sortOrder,
        page,
        limit,
        search
      });
  
      // Build the filter object step by step with detailed logging
      const filter: Record<string, any> = {};
      
      // Basic filters with improved boolean parsing
      if (liquidityType) {
        filter.liquidityType = liquidityType;
        console.log('✅ Added liquidityType filter:', liquidityType);
      }
      
      // Fix boolean parsing - handle string conversion properly
      if (isVerified !== undefined) {
        const verifiedValue = String(isVerified).toLowerCase() === 'true';
        filter.isVerified = verifiedValue;
        console.log('✅ Added isVerified filter:', verifiedValue);
      }
      
      if (isActive !== undefined) {
        const activeValue = String(isActive).toLowerCase() === 'true';
        filter.isActive = activeValue;
        console.log('✅ Added isActive filter:', activeValue);
      }
  
      // Balance range filters
      if (minBalance !== undefined || maxBalance !== undefined) {
        const minBal = minBalance ? Number(minBalance) : undefined;
        const maxBal = maxBalance ? Number(maxBalance) : undefined;
        
        // Validate numbers
        if (minBal !== undefined && (isNaN(minBal) || minBal < 0)) {
          res.status(400).json({
            success: false,
            message: 'Invalid minBalance value'
          });
          return;
        }
        
        if (maxBal !== undefined && (isNaN(maxBal) || maxBal < 0)) {
          res.status(400).json({
            success: false,
            message: 'Invalid maxBalance value'
          });
          return;
        }
  
        const balanceField = network === 'base' ? 'baseBalance' : 
                            network === 'solana' ? 'solanaBalance' : 'totalBalance';
        
        const balanceFilter: any = {};
        if (minBal !== undefined) balanceFilter.$gte = minBal;
        if (maxBal !== undefined) balanceFilter.$lte = maxBal;
        
        filter[balanceField] = balanceFilter;
        console.log(`✅ Added ${balanceField} filter:`, balanceFilter);
      }
  
      console.log('🎯 Final MongoDB filter:', JSON.stringify(filter, null, 2));
  
      // First, test if ANY records match our filter
      const testCount = await LiquidityPosition.countDocuments(filter);
      console.log(`🔢 Records matching filter: ${testCount}`);
  
      if (testCount === 0) {
        console.log('⚠️ No records match the filter. Testing individual filters...');
        
        // Test each filter component individually
        const filterTests = {
          'no_filter': await LiquidityPosition.countDocuments({}),
          'liquidityType_only': liquidityType ? await LiquidityPosition.countDocuments({ liquidityType }) : 'N/A',
          'isVerified_only': isVerified !== undefined ? await LiquidityPosition.countDocuments({ isVerified: String(isVerified).toLowerCase() === 'true' }) : 'N/A',
          'isActive_only': isActive !== undefined ? await LiquidityPosition.countDocuments({ isActive: String(isActive).toLowerCase() === 'true' }) : 'N/A'
        };
        
        console.log('🧪 Individual filter test results:', filterTests);
      }
  
      // Build sort object
      const sort: Record<string, 1 | -1> = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;
  
      // Calculate pagination
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;
  
      // Build aggregation pipeline - START WITH JUST THE MATCH
      const pipeline: any[] = [
        { $match: filter }
      ];
  
      // Add lookups
      pipeline.push({
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      });
  
      // Use preserveNullAndEmptyArrays to keep records even if user lookup fails
      pipeline.push({ 
        $unwind: { 
          path: '$user', 
          preserveNullAndEmptyArrays: true 
        } 
      });
  
      pipeline.push({
        $lookup: {
          from: 'wallets',
          localField: 'walletId',
          foreignField: '_id',
          as: 'wallet'
        }
      });
  
      // Use preserveNullAndEmptyArrays to keep records even if wallet lookup fails
      pipeline.push({ 
        $unwind: { 
          path: '$wallet', 
          preserveNullAndEmptyArrays: true 
        } 
      });
  
      // Add search filter AFTER lookups if provided
      if (search) {
        const searchRegex = new RegExp(search.toString(), 'i');
        pipeline.push({
          $match: {
            $or: [
              { 'user.name': searchRegex },
              { 'user.email': searchRegex },
              { 'bankAccount.accountName': searchRegex },
              { 'bankAccount.bankName': searchRegex }
            ]
          }
        });
        console.log('✅ Added search filter:', search);
      }
  
      // Add sorting and pagination
      pipeline.push({ $sort: sort });
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limitNum });
  
      // Project the final structure
      pipeline.push({
        $project: {
          id: '$_id',
          user: {
            id: { $ifNull: ['$user._id', null] },
            name: { $ifNull: ['$user.name', 'Unknown'] },
            email: { $ifNull: ['$user.email', 'Unknown'] },
            isEmailVerified: { $ifNull: ['$user.isEmailVerified', false] },
            createdAt: { $ifNull: ['$user.createdAt', null] }
          },
          liquidityType: 1,
          balances: {
            base: { $ifNull: ['$baseBalance', 0] },
            solana: { $ifNull: ['$solanaBalance', 0] },
            total: { $ifNull: ['$totalBalance', 0] }
          },
          bankAccount: {
            accountNumber: { $ifNull: ['$bankAccount.accountNumber', null] },
            bankCode: { $ifNull: ['$bankAccount.bankCode', null] },
            bankName: { $ifNull: ['$bankAccount.bankName', null] },
            accountName: { $ifNull: ['$bankAccount.accountName', null] }
          },
          wallets: {
            baseAddress: { $ifNull: ['$wallet.baseAddress', null] },
            solanaAddress: { $ifNull: ['$wallet.solanaAddress', null] }
          },
          status: {
            isActive: { $ifNull: ['$isActive', false] },
            isVerified: { $ifNull: ['$isVerified', false] }
          },
          timestamps: {
            createdAt: 1,
            updatedAt: 1,
            lastDepositAt: 1,
            lastWithdrawalAt: 1
          }
        }
      });
  
      console.log('📋 Aggregation pipeline steps:', pipeline.length);
  
      // Execute the aggregation
      const providers = await LiquidityPosition.aggregate(pipeline);
      console.log(`✅ Aggregation returned ${providers.length} providers`);
  
      // Get total count for pagination - use simpler approach
      let totalProviders = 0;
      if (search) {
        // If search is used, we need to count with lookups
        const countPipeline = [
          { $match: filter },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          {
            $match: {
              $or: [
                { 'user.name': new RegExp(search.toString(), 'i') },
                { 'user.email': new RegExp(search.toString(), 'i') },
                { 'bankAccount.accountName': new RegExp(search.toString(), 'i') },
                { 'bankAccount.bankName': new RegExp(search.toString(), 'i') }
              ]
            }
          },
          { $count: 'total' }
        ];
        const countResult = await LiquidityPosition.aggregate(countPipeline);
        totalProviders = countResult.length > 0 ? countResult[0].total : 0;
      } else {
        // Simple count without search
        totalProviders = await LiquidityPosition.countDocuments(filter);
      }
  
      console.log(`📊 Total providers matching criteria: ${totalProviders}`);
  
      // Calculate summary statistics using the same filter
      const summaryResult = await LiquidityPosition.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalProviders: { $sum: 1 },
            totalBalance: { $sum: { $ifNull: ['$totalBalance', 0] } },
            totalBaseBalance: { $sum: { $ifNull: ['$baseBalance', 0] } },
            totalSolanaBalance: { $sum: { $ifNull: ['$solanaBalance', 0] } },
            activeProviders: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
            },
            verifiedProviders: {
              $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
            },
            averageBalance: { $avg: { $ifNull: ['$totalBalance', 0] } }
          }
        }
      ]);
  
      const summary = summaryResult.length > 0 ? summaryResult[0] : {
        totalProviders: 0,
        totalBalance: 0,
        totalBaseBalance: 0,
        totalSolanaBalance: 0,
        activeProviders: 0,
        verifiedProviders: 0,
        averageBalance: 0
      };
  
      // Pagination info
      const totalPages = Math.ceil(totalProviders / limitNum);
      const hasNextPage = pageNum < totalPages;
      const hasPrevPage = pageNum > 1;
  
      console.log(`✅ Found ${providers.length} liquidity providers (${totalProviders} total)`);
      console.log('📈 Summary stats:', summary);
  
      res.status(200).json({
        success: true,
        data: {
          providers,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalItems: totalProviders,
            itemsPerPage: limitNum,
            hasNextPage,
            hasPrevPage
          },
          summary: {
            totalProviders: summary.totalProviders,
            totalBalance: Math.round((summary.totalBalance || 0) * 100) / 100,
            totalBaseBalance: Math.round((summary.totalBaseBalance || 0) * 100) / 100,
            totalSolanaBalance: Math.round((summary.totalSolanaBalance || 0) * 100) / 100,
            activeProviders: summary.activeProviders,
            verifiedProviders: summary.verifiedProviders,
            averageBalance: Math.round((summary.averageBalance || 0) * 100) / 100,
            networkDistribution: {
              base: Math.round((summary.totalBaseBalance || 0) * 100) / 100,
              solana: Math.round((summary.totalSolanaBalance || 0) * 100) / 100,
              basePercentage: summary.totalBalance > 0 ? Math.round(((summary.totalBaseBalance || 0) / summary.totalBalance) * 100) : 0,
              solanaPercentage: summary.totalBalance > 0 ? Math.round(((summary.totalSolanaBalance || 0) / summary.totalBalance) * 100) : 0
            }
          },
          filters: {
            applied: {
              minBalance,
              maxBalance,
              network,
              liquidityType,
              isVerified,
              isActive,
              search
            },
            sortBy,
            sortOrder
          },
          debug: {
            filterUsed: filter,
            totalRecordsMatchingFilter: testCount,
            pipelineSteps: pipeline.length
          }
        }
      });
  
    } catch (error) {
      console.error('❌ Admin get liquidity providers error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching liquidity providers',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

// @desc    Get liquidity provider statistics
// @route   GET /api/admin/liquidity-stats
// @access  Private/Admin
export const getLiquidityProviderStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📊 Admin fetching liquidity provider statistics...');

    // Overall statistics
    const overviewStats = await LiquidityPosition.aggregate([
      {
        $group: {
          _id: null,
          totalProviders: { $sum: 1 },
          activeProviders: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          verifiedProviders: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } },
          totalLiquidity: { $sum: '$totalBalance' },
          totalBaseBalance: { $sum: '$baseBalance' },
          totalSolanaBalance: { $sum: '$solanaBalance' },
          averageBalance: { $avg: '$totalBalance' },
          maxBalance: { $max: '$totalBalance' },
          minBalance: { $min: '$totalBalance' }
        }
      }
    ]);

    // Balance distribution (ranges)
    const balanceDistribution = await LiquidityPosition.aggregate([
      {
        $bucket: {
          groupBy: '$totalBalance',
          boundaries: [0, 100, 500, 1000, 5000, 10000, 50000, 100000, Infinity],
          default: 'other',
          output: {
            count: { $sum: 1 },
            totalBalance: { $sum: '$totalBalance' },
            averageBalance: { $avg: '$totalBalance' }
          }
        }
      }
    ]);

    // Liquidity type breakdown
    const liquidityTypeStats = await LiquidityPosition.aggregate([
      {
        $group: {
          _id: '$liquidityType',
          count: { $sum: 1 },
          totalBalance: { $sum: '$totalBalance' },
          averageBalance: { $avg: '$totalBalance' },
          activeCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          verifiedCount: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } }
        }
      }
    ]);

    // Network distribution
    const networkStats = await LiquidityPosition.aggregate([
      {
        $project: {
          baseBalance: 1,
          solanaBalance: 1,
          totalBalance: 1,
          basePercentage: {
            $cond: [
              { $gt: ['$totalBalance', 0] },
              { $multiply: [{ $divide: ['$baseBalance', '$totalBalance'] }, 100] },
              0
            ]
          },
          solanaPercentage: {
            $cond: [
              { $gt: ['$totalBalance', 0] },
              { $multiply: [{ $divide: ['$solanaBalance', '$totalBalance'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalBaseBalance: { $sum: '$baseBalance' },
          totalSolanaBalance: { $sum: '$solanaBalance' },
          averageBasePercentage: { $avg: '$basePercentage' },
          averageSolanaPercentage: { $avg: '$solanaPercentage' }
        }
      }
    ]);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await LiquidityPosition.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          newProviders: { $sum: 1 },
          totalNewBalance: { $sum: '$totalBalance' }
        }
      },
      { $sort: { '_id': 1 } },
      { $limit: 30 }
    ]);

    // Top providers by balance
    const topProviders = await LiquidityPosition.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          userName: '$user.name',
          userEmail: '$user.email',
          totalBalance: 1,
          baseBalance: 1,
          solanaBalance: 1,
          liquidityType: 1,
          isVerified: 1,
          createdAt: 1
        }
      },
      { $sort: { totalBalance: -1 } },
      { $limit: 10 }
    ]);

    const overview = overviewStats.length > 0 ? overviewStats[0] : {
      totalProviders: 0,
      activeProviders: 0,
      verifiedProviders: 0,
      totalLiquidity: 0,
      totalBaseBalance: 0,
      totalSolanaBalance: 0,
      averageBalance: 0,
      maxBalance: 0,
      minBalance: 0
    };

    console.log('✅ Liquidity provider statistics calculated');

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalProviders: overview.totalProviders,
          activeProviders: overview.activeProviders,
          verifiedProviders: overview.verifiedProviders,
          totalLiquidity: Math.round(overview.totalLiquidity * 100) / 100,
          averageBalance: Math.round(overview.averageBalance * 100) / 100,
          maxBalance: Math.round(overview.maxBalance * 100) / 100,
          minBalance: Math.round(overview.minBalance * 100) / 100,
          activePercentage: overview.totalProviders > 0 ? Math.round((overview.activeProviders / overview.totalProviders) * 100) : 0,
          verifiedPercentage: overview.totalProviders > 0 ? Math.round((overview.verifiedProviders / overview.totalProviders) * 100) : 0
        },
        balanceDistribution: balanceDistribution.map(bucket => ({
          range: bucket._id === 'other' ? '100K+' : `${bucket._id}`,
          count: bucket.count,
          totalBalance: Math.round(bucket.totalBalance * 100) / 100,
          averageBalance: Math.round(bucket.averageBalance * 100) / 100
        })),
        liquidityTypeBreakdown: liquidityTypeStats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            totalBalance: Math.round(stat.totalBalance * 100) / 100,
            averageBalance: Math.round(stat.averageBalance * 100) / 100,
            activeCount: stat.activeCount,
            verifiedCount: stat.verifiedCount
          };
          return acc;
        }, {} as any),
        networkBreakdown: networkStats.length > 0 ? {
          base: {
            totalBalance: Math.round(networkStats[0].totalBaseBalance * 100) / 100,
            percentage: overview.totalLiquidity > 0 ? Math.round((networkStats[0].totalBaseBalance / overview.totalLiquidity) * 100) : 0
          },
          solana: {
            totalBalance: Math.round(networkStats[0].totalSolanaBalance * 100) / 100,
            percentage: overview.totalLiquidity > 0 ? Math.round((networkStats[0].totalSolanaBalance / overview.totalLiquidity) * 100) : 0
          }
        } : { base: { totalBalance: 0, percentage: 0 }, solana: { totalBalance: 0, percentage: 0 } },
        recentActivity: recentActivity.map(activity => ({
          date: activity._id,
          newProviders: activity.newProviders,
          totalNewBalance: Math.round(activity.totalNewBalance * 100) / 100
        })),
        topProviders: topProviders.map(provider => ({
          id: provider._id,
          userName: provider.userName,
          userEmail: provider.userEmail,
          totalBalance: Math.round(provider.totalBalance * 100) / 100,
          baseBalance: Math.round(provider.baseBalance * 100) / 100,
          solanaBalance: Math.round(provider.solanaBalance * 100) / 100,
          liquidityType: provider.liquidityType,
          isVerified: provider.isVerified,
          createdAt: provider.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Admin get liquidity stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching liquidity statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// @desc    Get detailed information about a specific liquidity provider
// @route   GET /api/admin/liquidity-provider/:id
// @access  Private/Admin
export const getLiquidityProviderDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    console.log('🔍 Admin fetching detailed info for liquidity provider:', id);

    // Find liquidity position with user and wallet details
    const provider = await LiquidityPosition.findById(id)
      .populate('userId', 'name email isEmailVerified createdAt updatedAt')
      .populate('walletId', 'baseAddress solanaAddress');

    if (!provider) {
      res.status(404).json({
        success: false,
        message: 'Liquidity provider not found'
      });
      return;
    }

    // Get transaction history for this provider
    const transactions = await Transaction.find({ 
      liquidityPositionId: provider._id 
    })
      .sort({ createdAt: -1 })
      .limit(50); // Last 50 transactions

    // Get real-time balance update
    const userId = provider.userId._id.toString();
    console.log('🔄 Updating real-time balances...');
    const balancesResult = await walletService.updateLiquidityPositionBalances(userId);

    // Get updated position after balance refresh
    const updatedProvider = await LiquidityPosition.findById(id)
      .populate('userId', 'name email isEmailVerified createdAt updatedAt')
      .populate('walletId', 'baseAddress solanaAddress');

    // Calculate transaction summary
    const transactionSummary = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      pendingTransactions: 0,
      failedTransactions: 0,
      lastTransactionDate: null as Date | null
    };

    transactions.forEach(tx => {
      if (tx.type === 'deposit') {
        transactionSummary.totalDeposits += tx.amount;
      } else if (tx.type === 'withdrawal') {
        transactionSummary.totalWithdrawals += tx.amount;
      }

      if (tx.status === 'pending') transactionSummary.pendingTransactions++;
      if (tx.status === 'failed') transactionSummary.failedTransactions++;

      if (!transactionSummary.lastTransactionDate || tx.createdAt > transactionSummary.lastTransactionDate) {
        transactionSummary.lastTransactionDate = tx.createdAt;
      }
    });

    console.log('✅ Detailed liquidity provider info retrieved');

    res.status(200).json({
      success: true,
      data: {
        provider: {
          id: updatedProvider!._id,
          user: {
            id: updatedProvider!.userId._id,
            name: (updatedProvider!.userId as any).name,
            email: (updatedProvider!.userId as any).email,
            isEmailVerified: (updatedProvider!.userId as any).isEmailVerified,
            createdAt: (updatedProvider!.userId as any).createdAt,
            updatedAt: (updatedProvider!.userId as any).updatedAt
          },
          liquidityType: updatedProvider!.liquidityType,
          balances: {
            base: updatedProvider!.baseBalance,
            solana: updatedProvider!.solanaBalance,
            total: updatedProvider!.totalBalance,
            lastUpdated: new Date().toISOString(),
            liveBalances: balancesResult.success ? balancesResult.balances : null
          },
          bankAccount: {
            accountNumber: updatedProvider!.bankAccount.accountNumber,
            bankCode: updatedProvider!.bankAccount.bankCode,
            bankName: updatedProvider!.bankAccount.bankName,
            accountName: updatedProvider!.bankAccount.accountName
          },
          wallets: {
            baseAddress: (updatedProvider!.walletId as any).baseAddress,
            solanaAddress: (updatedProvider!.walletId as any).solanaAddress
          },
          status: {
            isActive: updatedProvider!.isActive,
            isVerified: updatedProvider!.isVerified
          },
          timestamps: {
            createdAt: updatedProvider!.createdAt,
            updatedAt: updatedProvider!.updatedAt,
            lastDepositAt: updatedProvider!.lastDepositAt,
            lastWithdrawalAt: updatedProvider!.lastWithdrawalAt
          }
        },
        transactionSummary: {
          totalDeposits: Math.round(transactionSummary.totalDeposits * 100) / 100,
          totalWithdrawals: Math.round(transactionSummary.totalWithdrawals * 100) / 100,
          netFlow: Math.round((transactionSummary.totalDeposits - transactionSummary.totalWithdrawals) * 100) / 100,
          pendingTransactions: transactionSummary.pendingTransactions,
          failedTransactions: transactionSummary.failedTransactions,
          totalTransactions: transactions.length,
          lastTransactionDate: transactionSummary.lastTransactionDate
        },
        recentTransactions: transactions.slice(0, 20).map(tx => ({
          id: tx._id,
          type: tx.type,
          network: tx.network,
          amount: tx.amount,
          status: tx.status,
          txHash: tx.txHash,
          fromAddress: tx.fromAddress,
          toAddress: tx.toAddress,
          failureReason: tx.failureReason,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Admin get liquidity provider details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching liquidity provider details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// @desc    Update liquidity provider status
// @route   PUT /api/admin/liquidity-provider/:id/status
// @access  Private/Admin
export const updateProviderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive, isVerified, reason } = req.body;
    const adminUser = req.user!;

    console.log('🔧 Admin updating provider status:', {
      providerId: id,
      isActive,
      isVerified,
      reason,
      adminId: adminUser._id
    });

    const provider = await LiquidityPosition.findById(id);
    if (!provider) {
      res.status(404).json({
        success: false,
        message: 'Liquidity provider not found'
      });
      return;
    }

    // Store previous status for logging
    const previousStatus = {
      isActive: provider.isActive,
      isVerified: provider.isVerified
    };

    // Update status fields if provided
    if (isActive !== undefined) provider.isActive = isActive;
    if (isVerified !== undefined) provider.isVerified = isVerified;

    await provider.save();

    // Log the status change (you might want to create an audit log model)
    console.log('📝 Status change logged:', {
      providerId: id,
      adminId: adminUser._id,
      adminEmail: adminUser.email,
      previousStatus,
      newStatus: {
        isActive: provider.isActive,
        isVerified: provider.isVerified
      },
      reason,
      timestamp: new Date().toISOString()
    });

    // Get updated provider info with user details
    const updatedProvider = await LiquidityPosition.findById(id)
      .populate('userId', 'name email');

    console.log('✅ Provider status updated successfully');

    res.status(200).json({
      success: true,
      message: 'Provider status updated successfully',
      data: {
        provider: {
          id: updatedProvider!._id,
          user: {
            name: (updatedProvider!.userId as any).name,
            email: (updatedProvider!.userId as any).email
          },
          previousStatus,
          newStatus: {
            isActive: updatedProvider!.isActive,
            isVerified: updatedProvider!.isVerified
          },
          updatedBy: {
            adminId: adminUser._id,
            adminEmail: adminUser.email
          },
          reason,
          updatedAt: updatedProvider!.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Admin update provider status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating provider status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
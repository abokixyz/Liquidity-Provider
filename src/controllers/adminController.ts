import { Request, Response } from 'express';
import { LiquidityPosition } from '../models/Liquidity';
import { User, IUser } from '../models/User';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import walletService from '../services/walletService';

interface AuthRequest extends Request {
  user?: IUser;
}

// @desc    Get all liquidity providers with balance filtering
// @route   GET /api/admin/liquidity-providers
// @access  Private/Admin
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

    // Build the filter object
    const filter: any = {};
    
    // Basic filters
    if (liquidityType) filter.liquidityType = liquidityType;
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    // Balance range filters
    const balanceFilter: any = {};
    if (minBalance || maxBalance) {
      if (network === 'base') {
        if (minBalance) balanceFilter.baseBalance = { $gte: Number(minBalance) };
        if (maxBalance) balanceFilter.baseBalance = { ...balanceFilter.baseBalance, $lte: Number(maxBalance) };
      } else if (network === 'solana') {
        if (minBalance) balanceFilter.solanaBalance = { $gte: Number(minBalance) };
        if (maxBalance) balanceFilter.solanaBalance = { ...balanceFilter.solanaBalance, $lte: Number(maxBalance) };
      } else { // total
        if (minBalance) balanceFilter.totalBalance = { $gte: Number(minBalance) };
        if (maxBalance) balanceFilter.totalBalance = { ...balanceFilter.totalBalance, $lte: Number(maxBalance) };
      }
      Object.assign(filter, balanceFilter);
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build aggregation pipeline for better performance
    const pipeline: any[] = [
      { $match: filter },
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
        $lookup: {
          from: 'wallets',
          localField: 'walletId',
          foreignField: '_id',
          as: 'wallet'
        }
      },
      { $unwind: '$wallet' }
    ];

    // Add search filter if provided
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'user.name': { $regex: search, $options: 'i' } },
            { 'user.email': { $regex: search, $options: 'i' } },
            { 'bankAccount.accountName': { $regex: search, $options: 'i' } },
            { 'bankAccount.bankName': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    // Add sorting and pagination
    pipeline.push(
      { $sort: sort },
      { $skip: skip },
      { $limit: limitNum }
    );

    // Project the final structure
    pipeline.push({
      $project: {
        id: '$_id',
        user: {
          id: '$user._id',
          name: '$user.name',
          email: '$user.email',
          isEmailVerified: '$user.isEmailVerified',
          createdAt: '$user.createdAt'
        },
        liquidityType: 1,
        balances: {
          base: '$baseBalance',
          solana: '$solanaBalance',
          total: '$totalBalance'
        },
        bankAccount: {
          accountNumber: '$bankAccount.accountNumber',
          bankCode: '$bankAccount.bankCode',
          bankName: '$bankAccount.bankName',
          accountName: '$bankAccount.accountName'
        },
        wallets: {
          baseAddress: '$wallet.baseAddress',
          solanaAddress: '$wallet.solanaAddress'
        },
        status: {
          isActive: '$isActive',
          isVerified: '$isVerified'
        },
        timestamps: {
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
          lastDepositAt: '$lastDepositAt',
          lastWithdrawalAt: '$lastWithdrawalAt'
        }
      }
    });

    // Execute the aggregation
    const providers = await LiquidityPosition.aggregate(pipeline);

    // Get total count for pagination (without limit)
    const countPipeline = pipeline.slice(0, -3); // Remove sort, skip, limit, and project
    countPipeline.push({ $count: 'total' });
    const countResult = await LiquidityPosition.aggregate(countPipeline);
    const totalProviders = countResult.length > 0 ? countResult[0].total : 0;

    // Calculate summary statistics
    const summaryPipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          totalProviders: { $sum: 1 },
          totalBalance: { $sum: '$totalBalance' },
          totalBaseBalance: { $sum: '$baseBalance' },
          totalSolanaBalance: { $sum: '$solanaBalance' },
          activeProviders: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          verifiedProviders: {
            $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
          },
          averageBalance: { $avg: '$totalBalance' }
        }
      }
    ];

    const summaryResult = await LiquidityPosition.aggregate(summaryPipeline);
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
          totalBalance: Math.round(summary.totalBalance * 100) / 100,
          totalBaseBalance: Math.round(summary.totalBaseBalance * 100) / 100,
          totalSolanaBalance: Math.round(summary.totalSolanaBalance * 100) / 100,
          activeProviders: summary.activeProviders,
          verifiedProviders: summary.verifiedProviders,
          averageBalance: Math.round(summary.averageBalance * 100) / 100,
          networkDistribution: {
            base: Math.round(summary.totalBaseBalance * 100) / 100,
            solana: Math.round(summary.totalSolanaBalance * 100) / 100,
            basePercentage: summary.totalBalance > 0 ? Math.round((summary.totalBaseBalance / summary.totalBalance) * 100) : 0,
            solanaPercentage: summary.totalBalance > 0 ? Math.round((summary.totalSolanaBalance / summary.totalBalance) * 100) : 0
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
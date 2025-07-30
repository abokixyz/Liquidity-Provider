import express from 'express';
import { LiquidityPosition } from '../models/Liquidity';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const router = express.Router();

// ✅ API Key Authentication Middleware
const apiKeyAuth = (req: Request, res: Response, next: express.NextFunction): void => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKeys = (process.env.PUBLIC_API_KEYS || '').split(',').map(key => key.trim());
  
  if (!apiKey || !validApiKeys.includes(apiKey as string)) {
    res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'INVALID_API_KEY'
    });
    return;
  }
  
  console.log('✅ Valid API key used:', (apiKey as string).substring(0, 8) + '...');
  next();
};

// ✅ Rate limiting for public API
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each API key to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-api-key'] as string) || req.ip || '';
  },
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/**
 * @swagger
 * /api/public/liquidity/stats:
 *   get:
 *     summary: Get public liquidity statistics (External API)
 *     tags: [Public API]
 *     parameters:
 *       - in: header
 *         name: x-api-key
 *         required: true
 *         schema:
 *           type: string
 *         description: API key for external access
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Response format
 *     responses:
 *       200:
 *         description: Public liquidity statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalLiquidity:
 *                       type: number
 *                     totalProviders:
 *                       type: number
 *                     networkDistribution:
 *                       type: object
 *                     lastUpdated:
 *                       type: string
 */
router.get('/stats', publicApiLimiter, apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const format = req.query.format || 'json';
    
    console.log('🌐 Public API: Liquidity stats requested');
    
    // Get aggregated statistics (no sensitive data)
    const stats = await LiquidityPosition.aggregate([
      {
        $group: {
          _id: null,
          totalProviders: { $sum: 1 },
          activeProviders: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          verifiedProviders: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } },
          totalLiquidity: { $sum: '$totalBalance' },
          totalBaseBalance: { $sum: '$baseBalance' },
          totalSolanaBalance: { $sum: '$solanaBalance' },
          averageBalance: { $avg: '$totalBalance' }
        }
      }
    ]);

    // Balance distribution by ranges
    const balanceDistribution = await LiquidityPosition.aggregate([
      {
        $bucket: {
          groupBy: '$totalBalance',
          boundaries: [0, 1000, 5000, 10000, 50000, 100000, Infinity],
          default: 'other',
          output: {
            count: { $sum: 1 },
            totalBalance: { $sum: '$totalBalance' }
          }
        }
      }
    ]);

    const overview = stats.length > 0 ? stats[0] : {
      totalProviders: 0,
      activeProviders: 0,
      verifiedProviders: 0,
      totalLiquidity: 0,
      totalBaseBalance: 0,
      totalSolanaBalance: 0,
      averageBalance: 0
    };

    const publicData = {
      totalLiquidity: Math.round(overview.totalLiquidity * 100) / 100,
      totalProviders: overview.totalProviders,
      activeProviders: overview.activeProviders,
      verifiedProviders: overview.verifiedProviders,
      averageBalance: Math.round(overview.averageBalance * 100) / 100,
      networkDistribution: {
        base: {
          balance: Math.round(overview.totalBaseBalance * 100) / 100,
          percentage: overview.totalLiquidity > 0 ? Math.round((overview.totalBaseBalance / overview.totalLiquidity) * 100) : 0
        },
        solana: {
          balance: Math.round(overview.totalSolanaBalance * 100) / 100,
          percentage: overview.totalLiquidity > 0 ? Math.round((overview.totalSolanaBalance / overview.totalLiquidity) * 100) : 0
        }
      },
      balanceDistribution: balanceDistribution.map(bucket => ({
        range: bucket._id === 'other' ? '100K+' : `$${bucket._id.toLocaleString()}+`,
        count: bucket.count,
        totalBalance: Math.round(bucket.totalBalance * 100) / 100
      })),
      lastUpdated: new Date().toISOString(),
      api: {
        version: '1.0',
        rateLimit: '100 requests per 15 minutes',
        docs: 'https://your-domain.com/api-docs'
      }
    };

    // Handle different response formats
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=liquidity-stats.csv');
      
      const csv = [
        'Metric,Value',
        `Total Liquidity,${publicData.totalLiquidity}`,
        `Total Providers,${publicData.totalProviders}`,
        `Active Providers,${publicData.activeProviders}`,
        `Verified Providers,${publicData.verifiedProviders}`,
        `Average Balance,${publicData.averageBalance}`,
        `Base Network Balance,${publicData.networkDistribution.base.balance}`,
        `Solana Network Balance,${publicData.networkDistribution.solana.balance}`,
        `Last Updated,${publicData.lastUpdated}`
      ].join('\n');
      
      res.send(csv);
      return;
    }

    res.status(200).json({
      success: true,
      data: publicData
    });

  } catch (error) {
    console.error('❌ Public API stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching public statistics',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/public/liquidity/providers:
 *   get:
 *     summary: Get anonymized liquidity providers list (External API)
 *     tags: [Public API]
 *     parameters:
 *       - in: header
 *         name: x-api-key
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: minBalance
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: network
 *         schema:
 *           type: string
 *           enum: [base, solana, total]
 */
router.get('/providers', publicApiLimiter, apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 20, minBalance, network = 'total' } = req.query;
    const limitNum = Math.min(Number(limit), 100); // Max 100 results
    
    console.log('🌐 Public API: Providers list requested');
    
    // Build filter
    const filter: any = { isActive: true }; // Only show active providers
    
    if (minBalance) {
      if (network === 'base') {
        filter.baseBalance = { $gte: Number(minBalance) };
      } else if (network === 'solana') {
        filter.solanaBalance = { $gte: Number(minBalance) };
      } else {
        filter.totalBalance = { $gte: Number(minBalance) };
      }
    }

    // Get anonymized provider data (NO sensitive information)
    const providers = await LiquidityPosition.find(filter)
      .select('liquidityType baseBalance solanaBalance totalBalance createdAt isVerified')
      .sort({ totalBalance: -1 })
      .limit(limitNum);

    const anonymizedProviders = providers.map((provider, index) => ({
      id: `provider_${index + 1}`, // Anonymous ID
      liquidityType: provider.liquidityType,
      balances: {
        base: Math.round(provider.baseBalance * 100) / 100,
        solana: Math.round(provider.solanaBalance * 100) / 100,
        total: Math.round(provider.totalBalance * 100) / 100
      },
      isVerified: provider.isVerified,
      joinedDate: provider.createdAt.toISOString().split('T')[0], // Date only
      rank: index + 1
    }));

    res.status(200).json({
      success: true,
      data: {
        providers: anonymizedProviders,
        total: providers.length,
        filters: {
          minBalance: minBalance ? Number(minBalance) : null,
          network,
          limit: limitNum
        },
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Public API providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching providers',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/public/liquidity/realtime:
 *   get:
 *     summary: Get real-time liquidity data with WebSocket info (External API)
 *     tags: [Public API]
 */
router.get('/realtime', publicApiLimiter, apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🌐 Public API: Real-time data requested');
    
    // Get recent activity (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentActivity = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: twentyFourHoursAgo },
          status: 'confirmed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' }
          },
          totalVolume: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
          withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Current liquidity snapshot
    const currentSnapshot = await LiquidityPosition.aggregate([
      {
        $group: {
          _id: null,
          totalLiquidity: { $sum: '$totalBalance' },
          totalProviders: { $sum: 1 },
          baseBalance: { $sum: '$baseBalance' },
          solanaBalance: { $sum: '$solanaBalance' }
        }
      }
    ]);

    const snapshot = currentSnapshot[0] || {
      totalLiquidity: 0,
      totalProviders: 0,
      baseBalance: 0,
      solanaBalance: 0
    };

    res.status(200).json({
      success: true,
      data: {
        currentSnapshot: {
          totalLiquidity: Math.round(snapshot.totalLiquidity * 100) / 100,
          totalProviders: snapshot.totalProviders,
          networkDistribution: {
            base: Math.round(snapshot.baseBalance * 100) / 100,
            solana: Math.round(snapshot.solanaBalance * 100) / 100
          },
          timestamp: new Date().toISOString()
        },
        recentActivity: recentActivity.map(activity => ({
          hour: activity._id,
          totalVolume: Math.round(activity.totalVolume * 100) / 100,
          transactionCount: activity.transactionCount,
          deposits: Math.round(activity.deposits * 100) / 100,
          withdrawals: Math.round(activity.withdrawals * 100) / 100,
          netFlow: Math.round((activity.deposits - activity.withdrawals) * 100) / 100
        })),
        websocket: {
          available: false, // Set to true if you implement WebSocket
          endpoint: 'wss://your-domain.com/api/ws/liquidity',
          events: ['balance_update', 'new_provider', 'transaction_confirmed']
        },
        polling: {
          recommended: '30 seconds',
          rateLimit: '100 requests per 15 minutes'
        }
      }
    });

  } catch (error) {
    console.error('❌ Public API realtime error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching real-time data',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/public/health:
 *   get:
 *     summary: API health check (External API)
 *     tags: [Public API]
 */
router.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    endpoints: {
      stats: '/api/public/liquidity/stats',
      providers: '/api/public/liquidity/providers',
      realtime: '/api/public/liquidity/realtime'
    },
    rateLimit: '100 requests per 15 minutes',
    authentication: 'API Key required'
  });
});

export default router;
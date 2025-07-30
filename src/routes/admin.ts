import express from 'express';
import {
  getAllLiquidityProviders,
  getLiquidityProviderStats,
  updateProviderStatus,
  getLiquidityProviderDetails
} from '../controllers/adminController';
import { protect, adminOnly } from '../middleware/auth';
import { query, validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
    return;
  }
  next();
};

// Balance range validation
const validateBalanceFilter = [
  query('minBalance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum balance must be a positive number'),
  
  query('maxBalance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum balance must be a positive number'),
    
  query('network')
    .optional()
    .isIn(['base', 'solana', 'total'])
    .withMessage('Network must be one of: base, solana, total'),
    
  query('liquidityType')
    .optional()
    .isIn(['onramp', 'offramp'])
    .withMessage('Liquidity type must be either onramp or offramp'),
    
  query('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be a boolean'),
    
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
    
  query('sortBy')
    .optional()
    .isIn(['totalBalance', 'baseBalance', 'solanaBalance', 'createdAt', 'lastDepositAt'])
    .withMessage('sortBy must be one of: totalBalance, baseBalance, solanaBalance, createdAt, lastDepositAt'),
    
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be either asc or desc'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

/**
 * @swagger
 * /api/admin/liquidity-providers:
 *   get:
 *     summary: Get all liquidity providers with balance filtering (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minBalance
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum balance filter (in USDC)
 *         example: 100
 *       - in: query
 *         name: maxBalance
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum balance filter (in USDC)
 *         example: 10000
 *       - in: query
 *         name: network
 *         schema:
 *           type: string
 *           enum: [base, solana, total]
 *         description: Filter by specific network balance or total
 *         example: total
 *       - in: query
 *         name: liquidityType
 *         schema:
 *           type: string
 *           enum: [onramp, offramp]
 *         description: Filter by liquidity type
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [totalBalance, baseBalance, solanaBalance, createdAt, lastDepositAt]
 *           default: totalBalance
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by user name, email, or account name
 *     responses:
 *       200:
 *         description: Liquidity providers retrieved successfully
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
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               isEmailVerified:
 *                                 type: boolean
 *                           liquidityType:
 *                             type: string
 *                           balances:
 *                             type: object
 *                             properties:
 *                               base:
 *                                 type: number
 *                               solana:
 *                                 type: number
 *                               total:
 *                                 type: number
 *                           bankAccount:
 *                             type: object
 *                           wallets:
 *                             type: object
 *                           status:
 *                             type: object
 *                             properties:
 *                               isActive:
 *                                 type: boolean
 *                               isVerified:
 *                                 type: boolean
 *                           timestamps:
 *                             type: object
 *                     pagination:
 *                       type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalProviders:
 *                           type: integer
 *                         totalBalance:
 *                           type: number
 *                         averageBalance:
 *                           type: number
 *                         networkDistribution:
 *                           type: object
 *       401:
 *         description: Unauthorized - Admin access required
 *       403:
 *         description: Forbidden - Insufficient permissions
 */
router.get('/liquidity-providers', protect, adminOnly, validateBalanceFilter, handleValidationErrors, getAllLiquidityProviders);

/**
 * @swagger
 * /api/admin/liquidity-stats:
 *   get:
 *     summary: Get liquidity provider statistics (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liquidity statistics retrieved successfully
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
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalProviders:
 *                           type: integer
 *                         activeProviders:
 *                           type: integer
 *                         verifiedProviders:
 *                           type: integer
 *                         totalLiquidity:
 *                           type: number
 *                     balanceDistribution:
 *                       type: object
 *                     networkBreakdown:
 *                       type: object
 *                     recentActivity:
 *                       type: array
 */
router.get('/liquidity-stats', protect, adminOnly, getLiquidityProviderStats);

/**
 * @swagger
 * /api/admin/liquidity-provider/{id}:
 *   get:
 *     summary: Get detailed information about a specific liquidity provider (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Liquidity provider ID or user ID
 *     responses:
 *       200:
 *         description: Liquidity provider details retrieved successfully
 *       404:
 *         description: Liquidity provider not found
 */
router.get('/liquidity-provider/:id', protect, adminOnly, getLiquidityProviderDetails);

/**
 * @swagger
 * /api/admin/liquidity-provider/{id}/status:
 *   put:
 *     summary: Update liquidity provider status (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Liquidity provider ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 description: Set provider active/inactive status
 *               isVerified:
 *                 type: boolean
 *                 description: Set provider verification status
 *               reason:
 *                 type: string
 *                 description: Reason for status change (for audit log)
 *     responses:
 *       200:
 *         description: Provider status updated successfully
 *       404:
 *         description: Liquidity provider not found
 */
router.put('/liquidity-provider/:id/status', protect, adminOnly, updateProviderStatus);

export default router;
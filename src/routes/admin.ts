import express from 'express';
import {
  getAllLiquidityProviders,
  getLiquidityProviderStats,
  updateProviderStatus,
  getLiquidityProviderDetails
} from '../controllers/adminController';
import { protect, adminOnly } from '../middleware/auth';
import { adminAuth, createApiKeyRateLimit } from '../middleware/apiKeyAuth';
import { query, validationResult } from 'express-validator';

const router = express.Router();

// Enhanced rate limiting for admin operations - 200 requests per 15 minutes
const adminRateLimit = createApiKeyRateLimit(
  15 * 60 * 1000, // 15 minutes window
  200             // 200 requests per 15 minutes (increased from 30)
);

// High volume rate limit for bulk operations - 500 requests per 15 minutes
const heavyAdminRateLimit = createApiKeyRateLimit(
  15 * 60 * 1000, // 15 minutes window
  500             // 500 requests per 15 minutes
);

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
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT token for admin users
 *     adminApiKey:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 *       description: Admin API key with 'admin' service type or 'admin' permissions
 *   
 *   schemas:
 *     LiquidityProvider:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *               example: "John Doe"
 *             email:
 *               type: string
 *               example: "john@example.com"
 *             isEmailVerified:
 *               type: boolean
 *               example: true
 *             createdAt:
 *               type: string
 *               format: date-time
 *         liquidityType:
 *           type: string
 *           enum: [onramp, offramp]
 *           example: "onramp"
 *         balances:
 *           type: object
 *           properties:
 *             base:
 *               type: number
 *               example: 1500.50
 *               description: Balance on Base network (USDC)
 *             solana:
 *               type: number
 *               example: 750.25
 *               description: Balance on Solana network (USDC)
 *             total:
 *               type: number
 *               example: 2250.75
 *               description: Total balance across all networks
 *         bankAccount:
 *           type: object
 *           properties:
 *             accountNumber:
 *               type: string
 *               example: "1234567890"
 *             bankCode:
 *               type: string
 *               example: "000013"
 *             bankName:
 *               type: string
 *               example: "Guaranty Trust Bank"
 *             accountName:
 *               type: string
 *               example: "John Doe"
 *         wallets:
 *           type: object
 *           properties:
 *             baseAddress:
 *               type: string
 *               example: "0x742d35Cc6634C0532925a3b8D33aa42D8c8b0CeF"
 *             solanaAddress:
 *               type: string
 *               example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
 *         status:
 *           type: object
 *           properties:
 *             isActive:
 *               type: boolean
 *               example: true
 *             isVerified:
 *               type: boolean
 *               example: true
 *         timestamps:
 *           type: object
 *           properties:
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *             lastDepositAt:
 *               type: string
 *               format: date-time
 *             lastWithdrawalAt:
 *               type: string
 *               format: date-time
 * 
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         code:
 *           type: string
 *         errors:
 *           type: array
 *           items:
 *             type: object
 */

/**
 * @swagger
 * /api/admin/liquidity-providers:
 *   get:
 *     summary: Get all liquidity providers with advanced filtering (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *       - adminApiKey: []
 *     description: |
 *       Retrieve all liquidity providers with comprehensive filtering, sorting, and pagination options.
 *       
 *       **Authentication Options:**
 *       - **JWT Token:** Must have admin role - `Authorization: Bearer <token>`
 *       - **API Key:** Must have 'admin' service type or 'admin' permissions - `X-API-Key: <key>`
 *       
 *       **Rate Limits:**
 *       - 200 requests per 15 minutes per API key/user
 *       - Headers include current usage: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
 *       
 *       **API Key Usage Examples:**
 *       ```bash
 *       # Header method (recommended)
 *       curl -H "X-API-Key: ak_admin_1234567890abcdef" \\
 *            "https://api.example.com/api/admin/liquidity-providers"
 *       
 *       # Query parameter method
 *       curl "https://api.example.com/api/admin/liquidity-providers?apiKey=ak_admin_1234567890abcdef"
 *       ```
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
 *           default: total
 *         description: Filter by specific network balance or total
 *         example: total
 *       - in: query
 *         name: liquidityType
 *         schema:
 *           type: string
 *           enum: [onramp, offramp]
 *         description: Filter by liquidity provider type
 *         example: onramp
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *         example: true
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *         example: true
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [totalBalance, baseBalance, solanaBalance, createdAt, lastDepositAt]
 *           default: totalBalance
 *         description: Field to sort by
 *         example: totalBalance
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *         example: desc
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *         example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by user name, email, or bank account name
 *         example: "john@example.com"
 *       - in: query
 *         name: apiKey
 *         schema:
 *           type: string
 *         description: Admin API key (alternative to header)
 *         example: "ak_admin_1234567890abcdef"
 *     responses:
 *       200:
 *         description: Liquidity providers retrieved successfully
 *         headers:
 *           X-RateLimit-Limit:
 *             description: Rate limit maximum requests
 *             schema:
 *               type: integer
 *               example: 200
 *           X-RateLimit-Remaining:
 *             description: Rate limit remaining requests
 *             schema:
 *               type: integer
 *               example: 150
 *           X-RateLimit-Reset:
 *             description: Rate limit reset time (Unix timestamp)
 *             schema:
 *               type: integer
 *               example: 1640995200
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     providers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LiquidityProvider'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         totalItems:
 *                           type: integer
 *                           example: 87
 *                         itemsPerPage:
 *                           type: integer
 *                           example: 20
 *                         hasNextPage:
 *                           type: boolean
 *                           example: true
 *                         hasPrevPage:
 *                           type: boolean
 *                           example: false
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalProviders:
 *                           type: integer
 *                           example: 87
 *                         totalBalance:
 *                           type: number
 *                           example: 125750.50
 *                         totalBaseBalance:
 *                           type: number
 *                           example: 75450.25
 *                         totalSolanaBalance:
 *                           type: number
 *                           example: 50300.25
 *                         activeProviders:
 *                           type: integer
 *                           example: 75
 *                         verifiedProviders:
 *                           type: integer
 *                           example: 65
 *                         averageBalance:
 *                           type: number
 *                           example: 1445.40
 *                         networkDistribution:
 *                           type: object
 *                           properties:
 *                             base:
 *                               type: number
 *                               example: 75450.25
 *                             solana:
 *                               type: number
 *                               example: 50300.25
 *                             basePercentage:
 *                               type: integer
 *                               example: 60
 *                             solanaPercentage:
 *                               type: integer
 *                               example: 40
 *                     filters:
 *                       type: object
 *                       properties:
 *                         applied:
 *                           type: object
 *                         sortBy:
 *                           type: string
 *                         sortOrder:
 *                           type: string
 *       401:
 *         description: Unauthorized - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing_auth:
 *                 summary: No authentication provided
 *                 value:
 *                   success: false
 *                   message: "Admin authentication required: provide admin JWT token or admin API key"
 *                   code: "NO_ADMIN_AUTH"
 *               invalid_api_key:
 *                 summary: Invalid API key
 *                 value:
 *                   success: false
 *                   message: "Invalid or expired API key"
 *                   code: "INVALID_API_KEY"
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               insufficient_permissions:
 *                 summary: API key lacks admin permissions
 *                 value:
 *                   success: false
 *                   message: "Admin API key required. Current permissions insufficient."
 *                   code: "INSUFFICIENT_ADMIN_PERMISSIONS"
 *                   required: "admin permission or admin service"
 *                   current:
 *                     service: "liquidity"
 *                     permissions: ["read", "write"]
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Validation failed"
 *               errors:
 *                 - field: "minBalance"
 *                   message: "Minimum balance must be a positive number"
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Rate limit exceeded. Maximum 200 requests per 15 minutes"
 *               code: "RATE_LIMIT_EXCEEDED"
 *               limit: 200
 *               windowMs: 900000
 *               retryAfter: 1640995200
 */
router.get('/liquidity-providers', 
  adminAuth, 
  validateBalanceFilter, 
  handleValidationErrors, 
  adminRateLimit,
  getAllLiquidityProviders
);

/**
 * @swagger
 * /api/admin/liquidity-stats:
 *   get:
 *     summary: Get comprehensive liquidity provider statistics (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *       - adminApiKey: []
 *     description: |
 *       Get detailed statistics about all liquidity providers including balance distribution, 
 *       network breakdown, recent activity, and top performers.
 *       
 *       **Rate Limits:** 200 requests per 15 minutes
 *     parameters:
 *       - in: query
 *         name: apiKey
 *         schema:
 *           type: string
 *         description: Admin API key (alternative to header)
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
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalProviders:
 *                           type: integer
 *                           example: 87
 *                         activeProviders:
 *                           type: integer
 *                           example: 75
 *                         verifiedProviders:
 *                           type: integer
 *                           example: 65
 *                         totalLiquidity:
 *                           type: number
 *                           example: 125750.50
 *                         averageBalance:
 *                           type: number
 *                           example: 1445.40
 *                         maxBalance:
 *                           type: number
 *                           example: 25000.00
 *                         minBalance:
 *                           type: number
 *                           example: 50.00
 *                         activePercentage:
 *                           type: integer
 *                           example: 86
 *                         verifiedPercentage:
 *                           type: integer
 *                           example: 75
 *                     balanceDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           range:
 *                             type: string
 *                             example: "1000-5000"
 *                           count:
 *                             type: integer
 *                             example: 25
 *                           totalBalance:
 *                             type: number
 *                             example: 75000.00
 *                           averageBalance:
 *                             type: number
 *                             example: 3000.00
 *                     liquidityTypeBreakdown:
 *                       type: object
 *                       properties:
 *                         onramp:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                               example: 52
 *                             totalBalance:
 *                               type: number
 *                               example: 75450.25
 *                             averageBalance:
 *                               type: number
 *                               example: 1450.96
 *                             activeCount:
 *                               type: integer
 *                               example: 45
 *                             verifiedCount:
 *                               type: integer
 *                               example: 38
 *                         offramp:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                               example: 35
 *                             totalBalance:
 *                               type: number
 *                               example: 50300.25
 *                             averageBalance:
 *                               type: number
 *                               example: 1437.15
 *                             activeCount:
 *                               type: integer
 *                               example: 30
 *                             verifiedCount:
 *                               type: integer
 *                               example: 27
 *                     networkBreakdown:
 *                       type: object
 *                       properties:
 *                         base:
 *                           type: object
 *                           properties:
 *                             totalBalance:
 *                               type: number
 *                               example: 75450.25
 *                             percentage:
 *                               type: integer
 *                               example: 60
 *                         solana:
 *                           type: object
 *                           properties:
 *                             totalBalance:
 *                               type: number
 *                               example: 50300.25
 *                             percentage:
 *                               type: integer
 *                               example: 40
 *                     recentActivity:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                             example: "2024-01-15"
 *                           newProviders:
 *                             type: integer
 *                             example: 3
 *                           totalNewBalance:
 *                             type: number
 *                             example: 4500.75
 *                     topProviders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           userName:
 *                             type: string
 *                             example: "John Doe"
 *                           userEmail:
 *                             type: string
 *                             example: "john@example.com"
 *                           totalBalance:
 *                             type: number
 *                             example: 15750.50
 *                           baseBalance:
 *                             type: number
 *                             example: 9450.30
 *                           solanaBalance:
 *                             type: number
 *                             example: 6300.20
 *                           liquidityType:
 *                             type: string
 *                             example: "onramp"
 *                           isVerified:
 *                             type: boolean
 *                             example: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized - Admin access required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/liquidity-stats', 
  adminAuth, 
  adminRateLimit,
  getLiquidityProviderStats
);

/**
 * @swagger
 * /api/admin/liquidity-provider/{id}:
 *   get:
 *     summary: Get detailed information about a specific liquidity provider (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *       - adminApiKey: []
 *     description: |
 *       Get comprehensive details about a specific liquidity provider including 
 *       real-time balances, transaction history, and performance metrics.
 *       
 *       **Rate Limits:** 200 requests per 15 minutes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Liquidity provider ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: apiKey
 *         schema:
 *           type: string
 *         description: Admin API key (alternative to header)
 *     responses:
 *       200:
 *         description: Liquidity provider details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       allOf:
 *                         - $ref: '#/components/schemas/LiquidityProvider'
 *                         - type: object
 *                           properties:
 *                             balances:
 *                               type: object
 *                               properties:
 *                                 base:
 *                                   type: number
 *                                 solana:
 *                                   type: number
 *                                 total:
 *                                   type: number
 *                                 lastUpdated:
 *                                   type: string
 *                                   format: date-time
 *                                 liveBalances:
 *                                   type: object
 *                                   nullable: true
 *                                   description: Real-time blockchain balances
 *                     transactionSummary:
 *                       type: object
 *                       properties:
 *                         totalDeposits:
 *                           type: number
 *                           example: 5750.25
 *                         totalWithdrawals:
 *                           type: number
 *                           example: 2300.50
 *                         netFlow:
 *                           type: number
 *                           example: 3449.75
 *                         pendingTransactions:
 *                           type: integer
 *                           example: 2
 *                         failedTransactions:
 *                           type: integer
 *                           example: 1
 *                         totalTransactions:
 *                           type: integer
 *                           example: 25
 *                         lastTransactionDate:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                     recentTransactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [deposit, withdrawal]
 *                           network:
 *                             type: string
 *                             enum: [base, solana]
 *                           amount:
 *                             type: number
 *                           status:
 *                             type: string
 *                             enum: [pending, confirmed, failed, cancelled]
 *                           txHash:
 *                             type: string
 *                             nullable: true
 *                           fromAddress:
 *                             type: string
 *                             nullable: true
 *                           toAddress:
 *                             type: string
 *                             nullable: true
 *                           failureReason:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *       404:
 *         description: Liquidity provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Liquidity provider not found"
 *               code: "PROVIDER_NOT_FOUND"
 *       400:
 *         description: Invalid provider ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Invalid provider ID format"
 *               code: "INVALID_ID_FORMAT"
 *       401:
 *         description: Unauthorized - Admin access required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/liquidity-provider/:id', 
  adminAuth, 
  adminRateLimit,
  getLiquidityProviderDetails
);

/**
 * @swagger
 * /api/admin/liquidity-provider/{id}/status:
 *   put:
 *     summary: Update liquidity provider status (Admin only)
 *     tags: [Admin - Liquidity Management]
 *     security:
 *       - bearerAuth: []
 *       - adminApiKey: []
 *     description: |
 *       Update the operational status of a liquidity provider. This includes 
 *       activating/deactivating and verifying/unverifying providers.
 *       
 *       **Important:** All status changes are logged for audit purposes.
 *       
 *       **Rate Limits:** 200 requests per 15 minutes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Liquidity provider ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: apiKey
 *         schema:
 *           type: string
 *         description: Admin API key (alternative to header)
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
 *                 example: true
 *               isVerified:
 *                 type: boolean
 *                 description: Set provider verification status
 *example: true
               reason:
                 type: string
                 description: Reason for status change (for audit log)
                 example: "Verified bank account and compliance documents"
                 maxLength: 500
           examples:
             activate_and_verify:
               summary: Activate and verify provider
               value:
                 isActive: true
                 isVerified: true
                 reason: "Completed KYC verification and bank account validation"
             deactivate:
               summary: Deactivate provider
               value:
                 isActive: false
                 reason: "Suspicious activity detected - temporary suspension"
             verify_only:
               summary: Verify existing provider
               value:
                 isVerified: true
                 reason: "Manual verification completed by admin"
             unverify:
               summary: Remove verification
               value:
                 isVerified: false
                 reason: "Bank account details require re-verification"
     responses:
       200:
         description: Provider status updated successfully
         content:
           application/json:
             schema:
               type: object
               properties:
                 success:
                   type: boolean
                   example: true
                 message:
                   type: string
                   example: "Provider status updated successfully"
                 data:
                   type: object
                   properties:
                     provider:
                       type: object
                       properties:
                         id:
                           type: string
                           example: "507f1f77bcf86cd799439011"
                         user:
                           type: object
                           properties:
                             name:
                               type: string
                               example: "John Doe"
                             email:
                               type: string
                               example: "john@example.com"
                         previousStatus:
                           type: object
                           properties:
                             isActive:
                               type: boolean
                               example: false
                             isVerified:
                               type: boolean
                               example: false
                         newStatus:
                           type: object
                           properties:
                             isActive:
                               type: boolean
                               example: true
                             isVerified:
                               type: boolean
                               example: true
                         updatedBy:
                           type: object
                           properties:
                             adminId:
                               type: string
                             adminEmail:
                               type: string
                               example: "admin@example.com"
                         reason:
                           type: string
                           example: "Completed KYC verification and bank account validation"
                         updatedAt:
                           type: string
                           format: date-time
                           example: "2024-01-15T10:30:00.000Z"
       404:
         description: Liquidity provider not found
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
             example:
               success: false
               message: "Liquidity provider not found"
               code: "PROVIDER_NOT_FOUND"
       400:
         description: Validation error
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
             examples:
               validation_error:
                 summary: Invalid request body
                 value:
                   success: false
                   message: "Validation failed"
                   errors:
                     - field: "isActive"
                       message: "isActive must be a boolean"
                     - field: "reason"
                       message: "Reason is required when changing status"
               invalid_id:
                 summary: Invalid provider ID
                 value:
                   success: false
                   message: "Invalid provider ID format"
                   code: "INVALID_ID_FORMAT"
       401:
         description: Unauthorized - Admin access required
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
       403:
         description: Forbidden - Insufficient permissions
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
       429:
         description: Rate limit exceeded
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
       500:
         description: Server error
         content:
           application/json:
             schema:
               $ref: '#/components/schemas/ErrorResponse'
             example:
               success: false
               message: "Server error updating provider status"
               code: "INTERNAL_SERVER_ERROR"
 */
router.put('/liquidity-provider/:id/status', 
    adminAuth, 
    adminRateLimit,
    updateProviderStatus
  );
  
  export default router;
  
  /**
   * ===========================================
   * API KEY USAGE EXAMPLES FOR ADMIN ROUTES
   * ===========================================
   * 
   * 1. AUTHENTICATION METHODS:
   * 
   * A) Using API Key in Header (Recommended):
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         https://api.example.com/api/admin/liquidity-providers
   * 
   * B) Using API Key in Query Parameter:
   *    curl "https://api.example.com/api/admin/liquidity-providers?apiKey=ak_admin_1234567890abcdef"
   * 
   * C) Using JWT Token (Existing Method):
   *    curl -H "Authorization: Bearer your_admin_jwt_token" \
   *         https://api.example.com/api/admin/liquidity-providers
   * 
   * 2. COMPLEX FILTERING EXAMPLES:
   * 
   * A) Get verified providers with high balance:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?minBalance=5000&isVerified=true&sortBy=totalBalance&sortOrder=desc"
   * 
   * B) Search for specific user:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?search=john@example.com"
   * 
   * C) Get onramp providers on Base network:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?liquidityType=onramp&network=base&isActive=true"
   * 
   * D) Get inactive providers for review:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?isActive=false&sortBy=createdAt&sortOrder=asc"
   * 
   * E) Pagination with filters:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?page=2&limit=50&minBalance=1000&isVerified=true"
   * 
   * 3. PROVIDER MANAGEMENT EXAMPLES:
   * 
   * A) Get specific provider details:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         https://api.example.com/api/admin/liquidity-provider/507f1f77bcf86cd799439011
   * 
   * B) Activate and verify a provider:
   *    curl -X PUT \
   *         -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         -H "Content-Type: application/json" \
   *         -d '{"isActive": true, "isVerified": true, "reason": "Completed full KYC verification"}' \
   *         https://api.example.com/api/admin/liquidity-provider/507f1f77bcf86cd799439011/status
   * 
   * C) Temporarily suspend a provider:
   *    curl -X PUT \
   *         -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         -H "Content-Type: application/json" \
   *         -d '{"isActive": false, "reason": "Suspicious activity - under investigation"}' \
   *         https://api.example.com/api/admin/liquidity-provider/507f1f77bcf86cd799439011/status
   * 
   * D) Verify provider without changing active status:
   *    curl -X PUT \
   *         -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         -H "Content-Type: application/json" \
   *         -d '{"isVerified": true, "reason": "Bank account documents verified manually"}' \
   *         https://api.example.com/api/admin/liquidity-provider/507f1f77bcf86cd799439011/status
   * 
   * E) Remove verification (require re-verification):
   *    curl -X PUT \
   *         -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         -H "Content-Type: application/json" \
   *         -d '{"isVerified": false, "reason": "Bank account details changed - requires re-verification"}' \
   *         https://api.example.com/api/admin/liquidity-provider/507f1f77bcf86cd799439011/status
   * 
   * 4. STATISTICS AND ANALYTICS:
   * 
   * A) Get comprehensive statistics:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         https://api.example.com/api/admin/liquidity-stats
   * 
   * 5. PAGINATION EXAMPLES:
   * 
   * A) Get first 50 providers:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?page=1&limit=50"
   * 
   * B) Get next page:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?page=2&limit=50"
   * 
   * C) Large batch processing (use heavy rate limit):
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?limit=100&page=1"
   * 
   * 6. ADVANCED FILTERING COMBINATIONS:
   * 
   * A) High-value verified onramp providers:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?liquidityType=onramp&isVerified=true&minBalance=10000&sortBy=totalBalance&sortOrder=desc"
   * 
   * B) Recently created unverified providers:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?isVerified=false&sortBy=createdAt&sortOrder=desc&limit=25"
   * 
   * C) Providers with Solana network focus:
   *    curl -H "X-API-Key: ak_admin_1234567890abcdef" \
   *         "https://api.example.com/api/admin/liquidity-providers?network=solana&minBalance=500&isActive=true"
   * 
   * ===========================================
   * API KEY REQUIREMENTS FOR ADMIN ACCESS
   * ===========================================
   * 
   * Required API Key Properties:
   * - Service: Must be 'admin'
   * - Permissions: Must include 'admin' permission
   * - Status: Must be active (isActive: true)
   * - Expiration: Must not be expired
   * 
   * Rate Limits:
   * - Standard: 200 requests per 15 minutes per API key
   * - Heavy operations: 500 requests per 15 minutes (for bulk processing)
   * - Headers include usage information:
   *   - X-RateLimit-Limit: 200
   *   - X-RateLimit-Remaining: 150
   *   - X-RateLimit-Reset: 1640995200
   * 
   * Security Features:
   * - All admin actions are logged with user/API key identification
   * - Status changes create audit trails
   * - Rate limiting prevents abuse
   * - Comprehensive error handling with specific error codes
   * 
   * Error Codes:
   * - NO_ADMIN_AUTH: No authentication provided
   * - INVALID_API_KEY: API key is invalid or expired
   * - INSUFFICIENT_ADMIN_PERMISSIONS: API key lacks admin permissions
   * - RATE_LIMIT_EXCEEDED: Too many requests
   * - VALIDATION_ERROR: Request validation failed
   * - PROVIDER_NOT_FOUND: Liquidity provider not found
   * - INVALID_ID_FORMAT: Invalid MongoDB ObjectId format
   * - INTERNAL_SERVER_ERROR: Server error
   * 
   * ===========================================
   * CREATING ADMIN API KEYS
   * ===========================================
   * 
   * To create an admin API key, use the API key creation endpoint:
   * 
   * curl -X POST \
   *      -H "Authorization: Bearer your_admin_jwt_token" \
   *      -H "Content-Type: application/json" \
   *      -d '{
   *        "name": "Admin Dashboard API Key",
   *        "service": "admin",
   *        "permissions": ["admin"],
   *        "expiresIn": 365
   *      }' \
   *      https://api.example.com/api/auth/api-keys
   * 
   * Response will include the full API key (only shown once):
   * {
   *   "success": true,
   *   "message": "API key created successfully",
   *   "data": {
   *     "apiKey": "ak_admin_1234567890abcdef...",
   *     "id": "507f1f77bcf86cd799439011",
   *     "name": "Admin Dashboard API Key",
   *     "service": "admin",
   *     "permissions": ["admin"],
   *     "expiresAt": "2025-01-15T10:30:00.000Z"
   *   }
   * }
   * 
   * ===========================================
   * RESPONSE EXAMPLES
   * ===========================================
   * 
   * 1. Successful Provider List Response:
   * {
   *   "success": true,
   *   "data": {
   *     "providers": [
   *       {
   *         "id": "507f1f77bcf86cd799439011",
   *         "user": {
   *           "id": "507f1f77bcf86cd799439012",
   *           "name": "John Doe",
   *           "email": "john@example.com",
   *           "isEmailVerified": true,
   *           "createdAt": "2024-01-01T00:00:00.000Z"
   *         },
   *         "liquidityType": "onramp",
   *         "balances": {
   *           "base": 1500.50,
   *           "solana": 750.25,
   *           "total": 2250.75
   *         },
   *         "bankAccount": {
   *           "accountNumber": "1234567890",
   *           "bankCode": "000013",
   *           "bankName": "Guaranty Trust Bank",
   *           "accountName": "John Doe"
   *         },
   *         "wallets": {
   *           "baseAddress": "0x742d35Cc6634C0532925a3b8D33aa42D8c8b0CeF",
   *           "solanaAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
   *         },
   *         "status": {
   *           "isActive": true,
   *           "isVerified": true
   *         },
   *         "timestamps": {
   *           "createdAt": "2024-01-01T00:00:00.000Z",
   *           "updatedAt": "2024-01-15T10:30:00.000Z",
   *           "lastDepositAt": "2024-01-14T15:20:00.000Z",
   *           "lastWithdrawalAt": "2024-01-13T09:45:00.000Z"
   *         }
   *       }
   *     ],
   *     "pagination": {
   *       "currentPage": 1,
   *       "totalPages": 5,
   *       "totalItems": 87,
   *       "itemsPerPage": 20,
   *       "hasNextPage": true,
   *       "hasPrevPage": false
   *     },
   *     "summary": {
   *       "totalProviders": 87,
   *       "totalBalance": 125750.50,
   *       "totalBaseBalance": 75450.25,
   *       "totalSolanaBalance": 50300.25,
   *       "activeProviders": 75,
   *       "verifiedProviders": 65,
   *       "averageBalance": 1445.40,
   *       "networkDistribution": {
   *         "base": 75450.25,
   *         "solana": 50300.25,
   *         "basePercentage": 60,
   *         "solanaPercentage": 40
   *       }
   *     }
   *   }
   * }
   * 
   * 2. Error Response Examples:
   * 
   * A) Invalid API Key:
   * {
   *   "success": false,
   *   "message": "Invalid or expired API key",
   *   "code": "INVALID_API_KEY"
   * }
   * 
   * B) Insufficient Permissions:
   * {
   *   "success": false,
   *   "message": "Admin API key required. Current permissions insufficient.",
   *   "code": "INSUFFICIENT_ADMIN_PERMISSIONS",
   *   "required": "admin permission or admin service",
   *   "current": {
   *     "service": "liquidity",
   *     "permissions": ["read", "write"]
   *   }
   * }
   * 
   * C) Rate Limit Exceeded:
   * {
   *   "success": false,
   *   "message": "Rate limit exceeded. Maximum 200 requests per 15 minutes",
   *   "code": "RATE_LIMIT_EXCEEDED",
   *   "limit": 200,
   *   "windowMs": 900000,
   *   "retryAfter": 1640995200
   * }
   * 
   * D) Validation Error:
   * {
   *   "success": false,
   *   "message": "Validation failed",
   *   "errors": [
   *     {
   *       "field": "minBalance",
   *       "message": "Minimum balance must be a positive number"
   *     },
   *     {
   *       "field": "sortBy",
   *       "message": "sortBy must be one of: totalBalance, baseBalance, solanaBalance, createdAt, lastDepositAt"
   *     }
   *   ]
   * }
   * 
   * ===========================================
   * SECURITY BEST PRACTICES
   * ===========================================
   * 
   * 1. API Key Storage:
   *    - Store API keys securely (environment variables, secure vaults)
   *    - Never commit API keys to version control
   *    - Use different API keys for different environments
   *    - Rotate API keys regularly (recommended: every 90 days)
   * 
   * 2. Access Control:
   *    - Use principle of least privilege
   *    - Create specific API keys for specific functions
   *    - Regularly review and remove unused keys
   *    - Monitor API key usage patterns
   * 
   * 3. Monitoring:
   *    - Set up alerts for unusual activity
   *    - Monitor rate limit violations
   *    - Track admin action patterns
   *    - Implement logging and audit trails
   * 
   * 4. Error Handling:
   *    - Implement exponential backoff for rate limits
   *    - Handle authentication errors gracefully
   *    - Log errors for debugging but don't expose sensitive info
   * 
   * ===========================================
   * TROUBLESHOOTING COMMON ISSUES
   * ===========================================
   * 
   * Issue: "Admin authentication required"
   * Solution: Ensure you're providing either:
   *   - X-API-Key header with admin API key, OR
   *   - Authorization header with admin JWT token
   * 
   * Issue: "Insufficient admin permissions"
   * Solution: Check that your API key has:
   *   - service: "admin", OR
   *   - permissions: ["admin"]
   * 
   * Issue: "Rate limit exceeded"
   * Solution: 
   *   - Wait for rate limit window to reset (15 minutes)
   *   - Implement exponential backoff in your application
   *   - Consider optimizing your request patterns
   *   - Use bulk operations where possible
   * 
   * Issue: "Invalid API key"
   * Solution: Check that:
   *   - API key is correctly formatted
   *   - API key hasn't expired
   *   - API key is still active (not revoked)
   *   - API key has proper permissions
   * 
   * Issue: "Validation failed"
   * Solution: Review the errors array in response:
   *   - Check parameter types (boolean vs string)
   *   - Verify required fields are present
   *   - Ensure values are within allowed ranges
   *   - Check enum values match exactly
   * 
   * Issue: "Provider not found"
   * Solution:
   *   - Verify the provider ID is correct
   *   - Ensure the ID is a valid MongoDB ObjectId format
   *   - Check if the provider was deleted
   * 
   * ===========================================
   * INTEGRATION EXAMPLES
   * ===========================================
   * 
   * JavaScript/Node.js Example:
   * 
   * const axios = require('axios');
   * 
   * const adminClient = axios.create({
   *   baseURL: 'https://api.example.com',
   *   headers: {
   *     'X-API-Key': process.env.ADMIN_API_KEY,
   *     'Content-Type': 'application/json'
   *   }
   * });
   * 
   * // Get all verified providers
   * async function getVerifiedProviders() {
   *   try {
   *     const response = await adminClient.get('/api/admin/liquidity-providers', {
   *       params: { isVerified: true, sortBy: 'totalBalance', sortOrder: 'desc' }
   *     });
   *     return response.data;
   *   } catch (error) {
   *     console.error('Error fetching providers:', error.response?.data);
   *     throw error;
   *   }
   * }
   * 
   * // Activate a provider
   * async function activateProvider(providerId, reason) {
   *   try {
   *     const response = await adminClient.put(`/api/admin/liquidity-provider/${providerId}/status`, {
   *       isActive: true,
   *       reason: reason
   *     });
   *     return response.data;
   *   } catch (error) {
   *     console.error('Error activating provider:', error.response?.data);
   *     throw error;
   *   }
   * }
   * 
   * Python Example:
   * 
   * import requests
   * import os
   * 
   * class AdminClient:
   *     def __init__(self):
   *         self.base_url = "https://api.example.com"
   *         self.headers = {
   *             "X-API-Key": os.getenv("ADMIN_API_KEY"),
   *             "Content-Type": "application/json"
   *         }
   *     
   *     def get_providers(self, **filters):
   *         response = requests.get(
   *             f"{self.base_url}/api/admin/liquidity-providers",
   *             headers=self.headers,
   *             params=filters
   *         )
   *         response.raise_for_status()
   *         return response.json()
   *     
   *     def update_provider_status(self, provider_id, is_active=None, is_verified=None, reason=None):
   *         data = {}
   *         if is_active is not None:
   *             data["isActive"] = is_active
   *         if is_verified is not None:
   *             data["isVerified"] = is_verified
   *         if reason:
   *             data["reason"] = reason
   *         
   *         response = requests.put(
   *             f"{self.base_url}/api/admin/liquidity-provider/{provider_id}/status",
   *             headers=self.headers,
   *             json=data
   *         )
   *         response.raise_for_status()
   *         return response.json()
   * 
   * # Usage
   * admin = AdminClient()
   * providers = admin.get_providers(isVerified=True, minBalance=1000)
   * print(f"Found {len(providers['data']['providers'])} verified providers")
   */
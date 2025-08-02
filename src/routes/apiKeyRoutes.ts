// routes/apiKeyRoutes.ts - Updated with complete routes
import express from 'express';
import { 
  createApiKey, 
  listApiKeys, 
  getApiKey, 
  updateApiKey, 
  revokeApiKey, 
  regenerateApiKey, 
  getApiKeyStats 
} from '../controllers/apiKeyController';
import { protect } from '../middleware/auth'; // Your existing JWT middleware
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Rate limiting for API key operations
const apiKeyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each user to 20 API key operations per windowMs
  message: {
    success: false,
    message: 'Too many API key operations, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation middleware for API key creation/update
const validateApiKeyRequest = [
  body('name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Name must be between 3 and 100 characters')
    .trim(),
  
  body('service')
    .isIn(['liquidity', 'trading', 'admin', 'analytics'])
    .withMessage('Service must be one of: liquidity, trading, admin, analytics'),
    
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
    .custom((permissions) => {
      const validPermissions = ['read', 'write', 'admin', 'withdraw', 'create', 'delete'];
      const invalidPerms = permissions.filter((p: string) => !validPermissions.includes(p));
      if (invalidPerms.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
      }
      return true;
    }),
    
  body('expiresIn')
    .optional()
    .isInt({ min: 1, max: 3650 })
    .withMessage('Expiration must be between 1 and 3650 days')
];

// Validation middleware for API key updates
const validateApiKeyUpdate = [
  body('name')
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage('Name must be between 3 and 100 characters')
    .trim(),
    
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
    .custom((permissions) => {
      const validPermissions = ['read', 'write', 'admin', 'withdraw', 'create', 'delete'];
      const invalidPerms = permissions.filter((p: string) => !validPermissions.includes(p));
      if (invalidPerms.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
      }
      return true;
    }),
    
  body('expiresIn')
    .optional()
    .custom((value) => {
      if (value !== null && (typeof value !== 'number' || value < 1 || value > 3650)) {
        throw new Error('Expiration must be between 1 and 3650 days or null');
      }
      return true;
    })
];

// Validation error handler
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
    return;
  }
  next();
};

/**
 * @swagger
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the API key
 *         name:
 *           type: string
 *           description: Human-readable name for the API key
 *         displayKey:
 *           type: string
 *           description: Partial API key for display (security)
 *         service:
 *           type: string
 *           enum: [liquidity, trading, admin, analytics]
 *           description: Service the API key is authorized for
 *         permissions:
 *           type: array
 *           items:
 *             type: string
 *             enum: [read, write, admin, withdraw, create, delete]
 *           description: Permissions granted to this API key
 *         isActive:
 *           type: boolean
 *           description: Whether the API key is active
 *         lastUsed:
 *           type: string
 *           format: date-time
 *           description: Last time the API key was used
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: When the API key expires (null if never expires)
 *         timeUntilExpiration:
 *           type: string
 *           description: Human-readable time until expiration
 *         daysUntilExpiration:
 *           type: number
 *           description: Days until expiration (null if never expires)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     ApiKeyCreate:
 *       type: object
 *       required:
 *         - name
 *         - service
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           example: "My Liquidity API Key"
 *         service:
 *           type: string
 *           enum: [liquidity, trading, admin, analytics]
 *           example: "liquidity"
 *         permissions:
 *           type: array
 *           items:
 *             type: string
 *             enum: [read, write, admin, withdraw, create, delete]
 *           example: ["read", "write", "withdraw"]
 *         expiresIn:
 *           type: number
 *           minimum: 1
 *           maximum: 3650
 *           description: Days until expiration (omit for no expiration)
 *           example: 365
 *           
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *     apiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 */

/**
 * @swagger
 * /api/auth/api-keys:
 *   post:
 *     summary: Create new API key
 *     description: Create a new API key for the authenticated user
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApiKeyCreate'
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     apiKey:
 *                       type: string
 *                       description: Full API key (shown only once)
 *                       example: "sk_1234567890abcdef..."
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     service:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or maximum keys reached
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Maximum number of API keys (10) reached"
 *                 code:
 *                   type: string
 *                   example: "VALIDATION_ERROR"
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', 
  protect, 
  apiKeyRateLimit, 
  validateApiKeyRequest, 
  handleValidationErrors, 
  createApiKey
);

/**
 * @swagger
 * /api/auth/api-keys:
 *   get:
 *     summary: List user's API keys
 *     description: Get a paginated list of the user's API keys
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by API key status
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *           enum: [liquidity, trading, admin, analytics]
 *         description: Filter by service
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
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
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
 *                     apiKeys:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ApiKey'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/', protect, listApiKeys);

/**
 * @swagger
 * /api/auth/api-keys/stats:
 *   get:
 *     summary: Get API key usage statistics
 *     description: Get statistics about the user's API key usage
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key statistics retrieved successfully
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
 *                         totalKeys:
 *                           type: integer
 *                         activeKeys:
 *                           type: integer
 *                         inactiveKeys:
 *                           type: integer
 *                         expiredKeys:
 *                           type: integer
 *                         recentlyUsed:
 *                           type: integer
 *                     byService:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           total:
 *                             type: integer
 *                           active:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', protect, getApiKeyStats);

/**
 * @swagger
 * /api/auth/api-keys/{id}:
 *   get:
 *     summary: Get specific API key details
 *     description: Get detailed information about a specific API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       404:
 *         description: API key not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', protect, getApiKey);

/**
 * @swagger
 * /api/auth/api-keys/{id}:
 *   put:
 *     summary: Update API key
 *     description: Update API key name, permissions, or expiration
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Updated API Key Name"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write, admin, withdraw, create, delete]
 *                 example: ["read", "write"]
 *               expiresIn:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 3650
 *                 description: Days until expiration (null for no expiration)
 *                 example: 730
 *     responses:
 *       200:
 *         description: API key updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       400:
 *         description: Validation error
 *       404:
 *         description: API key not found
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.put('/:id', 
  protect, 
  apiKeyRateLimit, 
  validateApiKeyUpdate, 
  handleValidationErrors, 
  updateApiKey
);

/**
 * @swagger
 * /api/auth/api-keys/{id}/regenerate:
 *   post:
 *     summary: Regenerate API key
 *     description: Generate a new API key while keeping the same permissions and settings
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key regenerated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     apiKey:
 *                       type: string
 *                       description: New API key (shown only once)
 *                       example: "sk_newkey1234567890abcdef..."
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     service:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       404:
 *         description: API key not found
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/:id/regenerate', 
  protect, 
  apiKeyRateLimit, 
  regenerateApiKey
);

/**
 * @swagger
 * /api/auth/api-keys/{id}:
 *   delete:
 *     summary: Revoke API key
 *     description: Deactivate an API key (it can no longer be used)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key revoked successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                       example: false
 *       404:
 *         description: API key not found
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.delete('/:id', 
  protect, 
  apiKeyRateLimit, 
  revokeApiKey
);

export default router;
// controllers/apiKeyController.ts
import { Request, Response } from 'express';
import { ApiKey, IApiKey } from '../models/ApiKey';
import { IUser } from '../models/User';

interface AuthRequest extends Request {
  user?: IUser;
}

// @desc    Create new API key
// @route   POST /api/auth/api-keys
// @access  Private
export const createApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, service, permissions, expiresIn } = req.body;
    const userId = req.user!._id;

    console.log('🔑 Creating API key for user:', userId);

    // Validate input
    if (!name || !service) {
      res.status(400).json({
        success: false,
        message: 'Name and service are required'
      });
      return;
    }

    // Check if user already has too many API keys
    const existingKeysCount = await ApiKey.countDocuments({ userId, isActive: true });
    if (existingKeysCount >= 10) { // Limit to 10 active keys per user
      res.status(400).json({
        success: false,
        message: 'Maximum number of API keys (10) reached. Please revoke unused keys first.'
      });
      return;
    }

    // Generate API key
    const { key, hashedKey } = ApiKey.generateApiKey();
    
    const expiresAt = expiresIn ? 
      new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : // days to milliseconds
      null;
    
    const apiKey = new ApiKey({
      name,
      key: key.substring(0, 16) + '...', // Store partial key for display
      hashedKey,
      userId,
      service,
      permissions: permissions || ['read'],
      expiresAt
    });
    
    await apiKey.save();
    
    console.log('✅ API key created successfully');
    
    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        apiKey: key, // Return full key only once
        id: apiKey._id,
        name: apiKey.name,
        service: apiKey.service,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Create API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating API key'
    });
  }
};

// @desc    List user's API keys
// @route   GET /api/auth/api-keys
// @access  Private
export const listApiKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;
    const { status, service, page = 1, limit = 20 } = req.query;
    
    // Build filter
    const filter: any = { userId };
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (service) filter.service = service;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [apiKeys, total] = await Promise.all([
      ApiKey.find(filter)
        .select('-hashedKey') // Don't return hashed keys
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ApiKey.countDocuments(filter)
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        apiKeys: apiKeys.map(key => ({
          id: key._id,
          name: key.name,
          displayKey: key.displayKey,
          service: key.service,
          permissions: key.permissions,
          isActive: key.isActive,
          lastUsed: key.lastUsed,
          expiresAt: key.expiresAt,
          timeUntilExpiration: key.timeUntilExpiration,
          daysUntilExpiration: key.getDaysUntilExpiration(),
          createdAt: key.createdAt
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ List API keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching API keys'
    });
  }
};

// @desc    Get specific API key details
// @route   GET /api/auth/api-keys/:id
// @access  Private
export const getApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;
    
    const apiKey = await ApiKey.findOne({ _id: id, userId })
      .select('-hashedKey');
    
    if (!apiKey) {
      res.status(404).json({
        success: false,
        message: 'API key not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        displayKey: apiKey.displayKey,
        service: apiKey.service,
        permissions: apiKey.permissions,
        isActive: apiKey.isActive,
        lastUsed: apiKey.lastUsed,
        expiresAt: apiKey.expiresAt,
        timeUntilExpiration: apiKey.timeUntilExpiration,
        daysUntilExpiration: apiKey.getDaysUntilExpiration(),
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Get API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching API key'
    });
  }
};

// @desc    Update API key (name, permissions, expiration)
// @route   PUT /api/auth/api-keys/:id
// @access  Private
export const updateApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, permissions, expiresIn } = req.body;
    const userId = req.user!._id;
    
    const updateData: any = {};
    if (name) updateData.name = name;
    if (permissions) updateData.permissions = permissions;
    if (expiresIn !== undefined) {
      updateData.expiresAt = expiresIn ? 
        new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : 
        null;
    }
    
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: id, userId }, // Ensure user owns the key
      updateData,
      { new: true, select: '-hashedKey' }
    );
    
    if (!apiKey) {
      res.status(404).json({
        success: false,
        message: 'API key not found'
      });
      return;
    }
    
    console.log('✅ API key updated:', apiKey.name);
    
    res.status(200).json({
      success: true,
      message: 'API key updated successfully',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        displayKey: apiKey.displayKey,
        service: apiKey.service,
        permissions: apiKey.permissions,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        timeUntilExpiration: apiKey.timeUntilExpiration
      }
    });
    
  } catch (error) {
    console.error('❌ Update API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating API key'
    });
  }
};

// @desc    Revoke/deactivate API key
// @route   DELETE /api/auth/api-keys/:id
// @access  Private
export const revokeApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;
    
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: id, userId }, // Ensure user owns the key
      { isActive: false },
      { new: true, select: '-hashedKey' }
    );
    
    if (!apiKey) {
      res.status(404).json({
        success: false,
        message: 'API key not found'
      });
      return;
    }
    
    console.log('🗑️ API key revoked:', apiKey.name);
    
    res.status(200).json({
      success: true,
      message: 'API key revoked successfully',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        isActive: apiKey.isActive
      }
    });
    
  } catch (error) {
    console.error('❌ Revoke API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error revoking API key'
    });
  }
};

// @desc    Regenerate API key (creates new key, keeps same permissions)
// @route   POST /api/auth/api-keys/:id/regenerate
// @access  Private
export const regenerateApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;
    
    const existingKey = await ApiKey.findOne({ _id: id, userId });
    if (!existingKey) {
      res.status(404).json({
        success: false,
        message: 'API key not found'
      });
      return;
    }
    
    // Generate new key
    const { key, hashedKey } = ApiKey.generateApiKey();
    
    // Update with new key
    existingKey.key = key.substring(0, 16) + '...';
    existingKey.hashedKey = hashedKey;
    existingKey.lastUsed = undefined; // Reset usage
    await existingKey.save();
    
    console.log('🔄 API key regenerated:', existingKey.name);
    
    res.status(200).json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        apiKey: key, // Return full key only once
        id: existingKey._id,
        name: existingKey.name,
        service: existingKey.service,
        permissions: existingKey.permissions
      }
    });
    
  } catch (error) {
    console.error('❌ Regenerate API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error regenerating API key'
    });
  }
};

// @desc    Get API key usage statistics
// @route   GET /api/auth/api-keys/stats
// @access  Private
export const getApiKeyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;
    
    const stats = await ApiKey.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalKeys: { $sum: 1 },
          activeKeys: { $sum: { $cond: ['$isActive', 1, 0] } },
          expiredKeys: { 
            $sum: { 
              $cond: [
                { $and: ['$expiresAt', { $lt: ['$expiresAt', new Date()] }] }, 
                1, 
                0
              ] 
            } 
          },
          recentlyUsed: {
            $sum: {
              $cond: [
                { $gte: ['$lastUsed', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                1,
                0
              ]
            }
          },
          serviceBreakdown: { $push: '$service' }
        }
      }
    ]);
    
    const serviceStats = await ApiKey.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$service',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalKeys: 0,
      activeKeys: 0,
      expiredKeys: 0,
      recentlyUsed: 0
    };
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalKeys: result.totalKeys,
          activeKeys: result.activeKeys,
          inactiveKeys: result.totalKeys - result.activeKeys,
          expiredKeys: result.expiredKeys,
          recentlyUsed: result.recentlyUsed
        },
        byService: serviceStats.reduce((acc, service) => {
          acc[service._id] = {
            total: service.count,
            active: service.active
          };
          return acc;
        }, {} as Record<string, { total: number; active: number }>)
      }
    });
    
  } catch (error) {
    console.error('❌ Get API key stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching API key statistics'
    });
  }
};
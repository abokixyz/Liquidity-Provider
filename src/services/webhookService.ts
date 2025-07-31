// src/services/webhookService.ts

import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { LiquidityPosition } from '../models/Liquidity';
import { Transaction } from '../models/Transaction';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastTriggered?: Date;
  apiKey: string;
}

// In-memory storage (use Redis or database in production)
const webhookSubscriptions: Map<string, WebhookSubscription> = new Map();

export class WebhookNotificationService {
  private static instance: WebhookNotificationService;

  public static getInstance(): WebhookNotificationService {
    if (!WebhookNotificationService.instance) {
      WebhookNotificationService.instance = new WebhookNotificationService();
    }
    return WebhookNotificationService.instance;
  }

  // Register webhook subscription
  public subscribe(apiKey: string, url: string, events: string[], secret?: string): string {
    const webhookId = crypto.randomUUID();
    const webhookSecret = secret || crypto.randomBytes(32).toString('hex');
    
    const subscription: WebhookSubscription = {
      id: webhookId,
      url,
      events,
      secret: webhookSecret,
      isActive: true,
      createdAt: new Date(),
      apiKey
    };

    webhookSubscriptions.set(webhookId, subscription);
    
    console.log('✅ Webhook subscription created:', {
      id: webhookId,
      url,
      events
    });

    return webhookId;
  }

  // Send webhook notification
  public async sendWebhook(event: string, data: any): Promise<void> {
    const activeWebhooks = Array.from(webhookSubscriptions.values())
      .filter(webhook => webhook.isActive && webhook.events.includes(event));

    if (activeWebhooks.length === 0) {
      console.log(`📡 No active webhooks for event: ${event}`);
      return;
    }

    console.log(`📡 Sending webhook for event: ${event} to ${activeWebhooks.length} subscribers`);

    const webhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      source: 'aboki-liquidity-api'
    };

    const promises = activeWebhooks.map(async (webhook) => {
      try {
        // Create signature for webhook security
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(webhookPayload))
          .digest('hex');

        await axios.post(webhook.url, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': event,
            'X-Webhook-ID': webhook.id
          },
          timeout: 10000 // 10 second timeout
        });

        // Update last triggered time
        webhook.lastTriggered = new Date();
        webhookSubscriptions.set(webhook.id, webhook);

        console.log(`✅ Webhook sent successfully to: ${webhook.url}`);
      } catch (error) {
        console.error(`❌ Webhook failed for ${webhook.url}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  // Get all subscriptions for an API key
  public getSubscriptions(apiKey: string): WebhookSubscription[] {
    return Array.from(webhookSubscriptions.values())
      .filter(webhook => webhook.apiKey === apiKey);
  }

  // Remove webhook subscription
  public unsubscribe(webhookId: string, apiKey: string): boolean {
    const webhook = webhookSubscriptions.get(webhookId);
    if (webhook && webhook.apiKey === apiKey) {
      webhookSubscriptions.delete(webhookId);
      console.log(`✅ Webhook unsubscribed: ${webhookId}`);
      return true;
    }
    return false;
  }

  // Get webhook by ID
  public getWebhook(webhookId: string, apiKey: string): WebhookSubscription | undefined {
    const webhook = webhookSubscriptions.get(webhookId);
    return webhook && webhook.apiKey === apiKey ? webhook : undefined;
  }

  // Update webhook status
  public updateWebhookStatus(webhookId: string, apiKey: string, isActive: boolean): boolean {
    const webhook = webhookSubscriptions.get(webhookId);
    if (webhook && webhook.apiKey === apiKey) {
      webhook.isActive = isActive;
      webhookSubscriptions.set(webhookId, webhook);
      return true;
    }
    return false;
  }

  // Get webhook statistics
  public getStats(): { total: number; active: number; totalEvents: string[] } {
    const allWebhooks = Array.from(webhookSubscriptions.values());
    const activeWebhooks = allWebhooks.filter(w => w.isActive);
    const allEvents = [...new Set(allWebhooks.flatMap(w => w.events))];
    
    return {
      total: allWebhooks.length,
      active: activeWebhooks.length,
      totalEvents: allEvents
    };
  }
}

export class LiquidityMonitoringService {
  private static instance: LiquidityMonitoringService;
  private lastKnownStats: any = null;
  private webhookService: WebhookNotificationService;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.webhookService = WebhookNotificationService.getInstance();
  }

  public static getInstance(): LiquidityMonitoringService {
    if (!LiquidityMonitoringService.instance) {
      LiquidityMonitoringService.instance = new LiquidityMonitoringService();
    }
    return LiquidityMonitoringService.instance;
  }

  private async getCurrentStats() {
    const stats = await LiquidityPosition.aggregate([
      {
        $group: {
          _id: null,
          totalProviders: { $sum: 1 },
          totalLiquidity: { $sum: '$totalBalance' },
          totalBaseBalance: { $sum: '$baseBalance' },
          totalSolanaBalance: { $sum: '$solanaBalance' },
          activeProviders: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          verifiedProviders: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } }
        }
      }
    ]);

    return stats[0] || {
      totalProviders: 0,
      totalLiquidity: 0,
      totalBaseBalance: 0,
      totalSolanaBalance: 0,
      activeProviders: 0,
      verifiedProviders: 0
    };
  }

  private async checkForChanges() {
    try {
      const currentStats = await this.getCurrentStats();
      
      if (this.lastKnownStats) {
        // Check for significant balance changes (>5% change)
        const liquidityChange = Math.abs(currentStats.totalLiquidity - this.lastKnownStats.totalLiquidity);
        const liquidityChangePercent = this.lastKnownStats.totalLiquidity > 0 
          ? (liquidityChange / this.lastKnownStats.totalLiquidity) * 100 
          : 0;
        
        if (liquidityChangePercent > 5) {
          await this.webhookService.sendWebhook('balance_change', {
            previous: this.lastKnownStats,
            current: currentStats,
            change: {
              amount: currentStats.totalLiquidity - this.lastKnownStats.totalLiquidity,
              percentage: liquidityChangePercent,
              direction: currentStats.totalLiquidity > this.lastKnownStats.totalLiquidity ? 'increase' : 'decrease'
            },
            timestamp: new Date().toISOString()
          });
        }

        // Check for new providers
        if (currentStats.totalProviders > this.lastKnownStats.totalProviders) {
          await this.webhookService.sendWebhook('new_provider', {
            previousCount: this.lastKnownStats.totalProviders,
            currentCount: currentStats.totalProviders,
            newProviders: currentStats.totalProviders - this.lastKnownStats.totalProviders,
            timestamp: new Date().toISOString()
          });
        }
      }

      this.lastKnownStats = currentStats;
    } catch (error) {
      console.error('❌ Error checking for changes:', error);
    }
  }

  // Monitor large transactions
  public async onLargeTransaction(transaction: any): Promise<void> {
    if (transaction.amount > 10000) { // $10k+ transactions
      await this.webhookService.sendWebhook('large_transaction', {
        transactionId: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        network: transaction.network,
        timestamp: transaction.createdAt,
        isLargeTransaction: true,
        threshold: 10000
      });
    }
  }

  // Monitor provider verification
  public async onProviderVerified(providerId: string): Promise<void> {
    await this.webhookService.sendWebhook('provider_verified', {
      providerId,
      timestamp: new Date().toISOString(),
      event: 'provider_verification_completed'
    });
  }

  // Start monitoring service
  public startMonitoring(): void {
    if (this.monitoringInterval) {
      console.log('🔍 Monitoring service already running');
      return;
    }

    // Check for changes every 2 minutes
    this.monitoringInterval = setInterval(() => {
      this.checkForChanges();
    }, 2 * 60 * 1000);

    console.log('🔍 Liquidity monitoring service started');
  }

  // Stop monitoring service
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🛑 Liquidity monitoring service stopped');
    }
  }

  // Get monitoring status
  public getStatus(): { isRunning: boolean; lastCheck?: Date; stats?: any } {
    return {
      isRunning: this.monitoringInterval !== null,
      lastCheck: this.lastKnownStats ? new Date() : undefined,
      stats: this.lastKnownStats
    };
  }
}

// API Key authentication middleware
const apiKeyAuth = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKeys = (process.env.PUBLIC_API_KEYS || '').split(',').map(key => key.trim());
  
  if (!apiKey || !validApiKeys.includes(apiKey)) {
    res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'INVALID_API_KEY'
    });
    return;
  }
  
  (req as any).apiKey = apiKey;
  next();
};

// Webhook routes
const router = express.Router();
const webhookService = WebhookNotificationService.getInstance();

// Subscribe to webhooks
router.post('/subscribe', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const { url, events, secret } = req.body;
    const apiKey = (req as any).apiKey;

    if (!url || !events || !Array.isArray(events)) {
      res.status(400).json({
        success: false,
        message: 'URL and events array are required',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      res.status(400).json({
        success: false,
        message: 'Invalid URL format',
        code: 'INVALID_URL'
      });
      return;
    }

    const validEvents = ['balance_change', 'new_provider', 'provider_verified', 'large_transaction', 'system_alert'];
    const invalidEvents = events.filter((event: string) => !validEvents.includes(event));
    
    if (invalidEvents.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid events: ${invalidEvents.join(', ')}`,
        validEvents,
        code: 'INVALID_EVENTS'
      });
      return;
    }

    const webhookId = webhookService.subscribe(apiKey, url, events, secret);
    
    res.status(201).json({
      success: true,
      data: {
        webhookId,
        url,
        events,
        secret: secret ? '***hidden***' : 'auto-generated',
        message: 'Webhook subscription created successfully'
      }
    });
  } catch (error) {
    console.error('❌ Webhook subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating webhook subscription',
      code: 'SERVER_ERROR'
    });
  }
});

// List webhooks
router.get('/', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const apiKey = (req as any).apiKey;
    const subscriptions = webhookService.getSubscriptions(apiKey);
    
    res.status(200).json({
      success: true,
      data: {
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          url: sub.url,
          events: sub.events,
          isActive: sub.isActive,
          createdAt: sub.createdAt,
          lastTriggered: sub.lastTriggered,
          secret: '***hidden***'
        })),
        total: subscriptions.length
      }
    });
  } catch (error) {
    console.error('❌ Get webhooks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching webhooks',
      code: 'SERVER_ERROR'
    });
  }
});

// Get specific webhook
router.get('/:webhookId', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const { webhookId } = req.params;
    const apiKey = (req as any).apiKey;
    
    const webhook = webhookService.getWebhook(webhookId, apiKey);
    
    if (webhook) {
      res.status(200).json({
        success: true,
        data: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
          lastTriggered: webhook.lastTriggered,
          secret: '***hidden***'
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching webhook',
      code: 'SERVER_ERROR'
    });
  }
});

// Update webhook status
router.put('/:webhookId', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const { webhookId } = req.params;
    const { isActive } = req.body;
    const apiKey = (req as any).apiKey;
    
    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'isActive must be a boolean',
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    const success = webhookService.updateWebhookStatus(webhookId, apiKey, isActive);
    
    if (success) {
      res.status(200).json({
        success: true,
        message: `Webhook ${isActive ? 'activated' : 'deactivated'} successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error updating webhook',
      code: 'SERVER_ERROR'
    });
  }
});

// Delete webhook
router.delete('/:webhookId', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const { webhookId } = req.params;
    const apiKey = (req as any).apiKey;
    
    const success = webhookService.unsubscribe(webhookId, apiKey);
    
    if (success) {
      res.status(200).json({
        success: true,
        message: 'Webhook unsubscribed successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND'
      });
    }
  } catch (error) {
    console.error('❌ Delete webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error unsubscribing webhook',
      code: 'SERVER_ERROR'
    });
  }
});

// Test webhook
router.post('/test/:webhookId', apiKeyAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { webhookId } = req.params;
    const apiKey = (req as any).apiKey;
    
    const webhook = webhookService.getWebhook(webhookId, apiKey);
    
    if (!webhook) {
      res.status(404).json({
        success: false,
        message: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND'
      });
      return;
    }

    // Send test webhook
    await webhookService.sendWebhook('system_alert', {
      type: 'test',
      message: 'This is a test webhook from ABOKI API',
      webhookId: webhook.id,
      timestamp: new Date().toISOString()
    });
    res.status(200).json({
      success: true,
      message: 'Test webhook sent successfully',
      data: {
        webhookId: webhook.id,
        url: webhook.url,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Test webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error testing webhook',
      code: 'SERVER_ERROR'
    });
  }
});

// Get webhook stats
router.get('/stats', apiKeyAuth, (req: express.Request, res: express.Response): void => {
  try {
    const apiKey = (req as any).apiKey;
    const userSubscriptions = webhookService.getSubscriptions(apiKey);
    const systemStats = webhookService.getStats();
    
    res.status(200).json({
      success: true,
      data: {
        user: {
          totalSubscriptions: userSubscriptions.length,
          activeSubscriptions: userSubscriptions.filter(w => w.isActive).length,
          subscribedEvents: [...new Set(userSubscriptions.flatMap(w => w.events))]
        },
        system: systemStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching webhook stats',
      code: 'SERVER_ERROR'
    });
  }
});

// Initialize and start monitoring service
const monitoringService = LiquidityMonitoringService.getInstance();
monitoringService.startMonitoring();

export { 
  router as webhookRoutes,
  monitoringService 
};
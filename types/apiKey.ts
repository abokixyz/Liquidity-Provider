// types/apiKey.ts - Define API key permissions and features
export interface ApiKeyPermissions {
    read: boolean;
    write: boolean;
    admin: boolean;
    withdraw: boolean;
    create: boolean;
    delete: boolean;
  }
  
  export interface ApiKeyFeatures {
    service: 'liquidity' | 'trading' | 'admin' | 'analytics';
    permissions: string[];
    allowedEndpoints: string[];
    rateLimits: {
      requestsPerMinute: number;
      requestsPerHour: number;
      requestsPerDay: number;
    };
  }
  
  // config/apiKeyFeatures.ts - Define what each API key type can access
  export const API_KEY_FEATURES: Record<string, ApiKeyFeatures> = {
    // LIQUIDITY SERVICE API KEYS
    liquidity_read: {
      service: 'liquidity',
      permissions: ['read'],
      allowedEndpoints: [
        'GET /api/liquidity/positions',
        'GET /api/liquidity/positions/:id',
        'GET /api/liquidity/balance',
        'GET /api/liquidity/history',
        'GET /api/liquidity/stats',
        'GET /api/liquidity/providers',
        'GET /api/liquidity/rates',
        'GET /api/liquidity/requirements'
      ],
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      }
    },
  
    liquidity_write: {
      service: 'liquidity',
      permissions: ['read', 'write'],
      allowedEndpoints: [
        // Read permissions
        'GET /api/liquidity/positions',
        'GET /api/liquidity/positions/:id',
        'GET /api/liquidity/balance',
        'GET /api/liquidity/history',
        'GET /api/liquidity/stats',
        'GET /api/liquidity/providers',
        'GET /api/liquidity/rates',
        'GET /api/liquidity/requirements',
        // Write permissions
        'POST /api/liquidity/positions',
        'PUT /api/liquidity/positions/:id',
        'POST /api/liquidity/deposit',
        'POST /api/liquidity/quotes',
        'POST /api/liquidity/orders',
        'PUT /api/liquidity/orders/:id',
        'POST /api/liquidity/bank-account',
        'PUT /api/liquidity/bank-account/:id'
      ],
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 500,
        requestsPerDay: 5000
      }
    },
  
    liquidity_full: {
      service: 'liquidity',
      permissions: ['read', 'write', 'withdraw'],
      allowedEndpoints: [
        // All previous permissions plus:
        'GET /api/liquidity/positions',
        'GET /api/liquidity/positions/:id',
        'GET /api/liquidity/balance',
        'GET /api/liquidity/history',
        'GET /api/liquidity/stats',
        'GET /api/liquidity/providers',
        'GET /api/liquidity/rates',
        'GET /api/liquidity/requirements',
        'POST /api/liquidity/positions',
        'PUT /api/liquidity/positions/:id',
        'POST /api/liquidity/deposit',
        'POST /api/liquidity/quotes',
        'POST /api/liquidity/orders',
        'PUT /api/liquidity/orders/:id',
        'POST /api/liquidity/bank-account',
        'PUT /api/liquidity/bank-account/:id',
        // Withdraw permissions
        'POST /api/liquidity/withdraw',
        'POST /api/liquidity/emergency-withdraw',
        'DELETE /api/liquidity/positions/:id',
        'POST /api/liquidity/transfer'
      ],
      rateLimits: {
        requestsPerMinute: 30,
        requestsPerHour: 200,
        requestsPerDay: 2000
      }
    },
  
    // TRADING SERVICE API KEYS
    trading_read: {
      service: 'trading',
      permissions: ['read'],
      allowedEndpoints: [
        'GET /api/trading/orders',
        'GET /api/trading/orders/:id',
        'GET /api/trading/history',
        'GET /api/trading/portfolio',
        'GET /api/trading/markets',
        'GET /api/trading/orderbook/:pair',
        'GET /api/trading/trades/:pair',
        'GET /api/trading/ticker/:pair',
        'GET /api/trading/balance',
        'GET /api/trading/fees',
        'GET /api/trading/limits'
      ],
      rateLimits: {
        requestsPerMinute: 120,
        requestsPerHour: 2000,
        requestsPerDay: 20000
      }
    },
  
    trading_write: {
      service: 'trading',
      permissions: ['read', 'write'],
      allowedEndpoints: [
        // Read permissions
        'GET /api/trading/orders',
        'GET /api/trading/orders/:id',
        'GET /api/trading/history',
        'GET /api/trading/portfolio',
        'GET /api/trading/markets',
        'GET /api/trading/orderbook/:pair',
        'GET /api/trading/trades/:pair',
        'GET /api/trading/ticker/:pair',
        'GET /api/trading/balance',
        'GET /api/trading/fees',
        'GET /api/trading/limits',
        // Write permissions
        'POST /api/trading/orders',
        'PUT /api/trading/orders/:id',
        'DELETE /api/trading/orders/:id',
        'POST /api/trading/orders/market',
        'POST /api/trading/orders/limit',
        'POST /api/trading/orders/stop',
        'POST /api/trading/batch-orders',
        'DELETE /api/trading/orders/cancel-all'
      ],
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      }
    },
  
    // ADMIN SERVICE API KEYS
    admin_read: {
      service: 'admin',
      permissions: ['read'],
      allowedEndpoints: [
        'GET /api/admin/users',
        'GET /api/admin/users/:id',
        'GET /api/admin/liquidity-providers',
        'GET /api/admin/liquidity-provider/:id',
        'GET /api/admin/liquidity-stats',
        'GET /api/admin/transactions',
        'GET /api/admin/system-stats',
        'GET /api/admin/audit-logs',
        'GET /api/admin/reports',
        'GET /api/admin/monitoring'
      ],
      rateLimits: {
        requestsPerMinute: 30,
        requestsPerHour: 500,
        requestsPerDay: 2000
      }
    },
  
    admin_write: {
      service: 'admin',
      permissions: ['read', 'write', 'admin'],
      allowedEndpoints: [
        // Read permissions
        'GET /api/admin/users',
        'GET /api/admin/users/:id',
        'GET /api/admin/liquidity-providers',
        'GET /api/admin/liquidity-provider/:id',
        'GET /api/admin/liquidity-stats',
        'GET /api/admin/transactions',
        'GET /api/admin/system-stats',
        'GET /api/admin/audit-logs',
        'GET /api/admin/reports',
        'GET /api/admin/monitoring',
        // Write/Admin permissions
        'PUT /api/admin/users/:id/status',
        'PUT /api/admin/liquidity-provider/:id/status',
        'POST /api/admin/users/:id/verify',
        'POST /api/admin/notifications',
        'PUT /api/admin/system-config',
        'POST /api/admin/maintenance-mode',
        'DELETE /api/admin/users/:id/sessions',
        'POST /api/admin/force-logout/:userId'
      ],
      rateLimits: {
        requestsPerMinute: 20,
        requestsPerHour: 200,
        requestsPerDay: 1000
      }
    },
  
    // ANALYTICS SERVICE API KEYS
    analytics_read: {
      service: 'analytics',
      permissions: ['read'],
      allowedEndpoints: [
        'GET /api/analytics/trading-volume',
        'GET /api/analytics/liquidity-metrics',
        'GET /api/analytics/user-activity',
        'GET /api/analytics/revenue',
        'GET /api/analytics/performance',
        'GET /api/analytics/market-data',
        'GET /api/analytics/reports',
        'GET /api/analytics/dashboards',
        'GET /api/analytics/export',
        'GET /api/analytics/real-time'
      ],
      rateLimits: {
        requestsPerMinute: 50,
        requestsPerHour: 800,
        requestsPerDay: 5000
      }
    }
  };
  
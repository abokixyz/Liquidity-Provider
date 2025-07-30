import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

// Load environment variables FIRST
dotenv.config();

console.log('🔍 Environment Variables Debug:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('PUBLIC_API_KEYS:', process.env.PUBLIC_API_KEYS ? 'SET' : 'NOT SET');

// Import swagger config with error handling - FIXED
let swaggerSpec: any = null;
try {
  const swaggerModule = require('./config/swagger');
  swaggerSpec = swaggerModule.default || swaggerModule;
} catch (error) {
  console.warn('⚠️  Swagger configuration not found - API docs will be disabled');
}

import connectDB from './config/database';
import authRoutes from './routes/auth';
import liquidityRoutes from './routes/liquidity';
import adminRoutes from './routes/admin';
import { webhookRoutes, monitoringService } from './services/webhookService';
import { notFound, errorHandler } from './middleware/error';

// Optional: Add public API routes if you create them
// import publicApiRoutes from './routes/publicApi';

const app = express();

// ✅ CRITICAL: Set port properly for Render
const PORT = parseInt(process.env.PORT || '5001', 10);

// Security middleware with minimal memory overhead
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ✅ ENHANCED: CORS with API key and external access support
console.log('🌐 ENHANCED CORS Configuration for External API Access');
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow specific origins from environment variable
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For public API and webhooks, allow all origins (you can restrict this later)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-API-Key'],
  optionsSuccessStatus: 200
}));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'} - API Key: ${req.headers['x-api-key'] ? 'Present' : 'None'}`);
  next();
});

// ✅ MEMORY: Conservative rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased for debugging
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit exceeded'
  }
});

app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Increased for debugging
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many auth attempts'
  }
});

// ✅ MEMORY: Strict JSON limits
app.use(express.json({ 
  limit: '500kb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: false,
  limit: '500kb',
  parameterLimit: 100
}));

// ✅ ENHANCED: Health check endpoint with webhook status
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT,
    memory: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'not set',
    apis: {
      auth: '/api/auth/*',
      liquidity: '/api/liquidity/*',
      admin: '/api/admin/*',
      webhooks: '/api/webhooks/*',
      public: '/api/public/*'
    },
    features: {
      corsEnabled: true,
      corsMode: 'enhanced-external-api',
      webhookSupport: true,
      apiKeyAuth: !!process.env.PUBLIC_API_KEYS,
      realTimeMonitoring: monitoringService.getStatus().isRunning
    },
    requestOrigin: req.headers.origin || 'none',
    userAgent: req.headers['user-agent'] || 'none'
  };
  
  console.log('🏥 Health check called:', healthData);
  res.status(200).json(healthData);
});

// ✅ ENHANCED: Root endpoint with complete API documentation
app.get('/', (req, res) => {
  console.log('🏠 Root endpoint called');
  res.status(200).json({
    success: true,
    message: 'ABOKI Liquidity Provider API',
    version: '1.0.0',
    port: PORT,
    features: {
      corsEnabled: true,
      webhookSupport: true,
      realTimeUpdates: true,
      apiKeyAuth: true,
      adminPanel: true
    },
    apis: {
      auth: {
        base: '/api/auth',
        description: 'User authentication and management',
        authentication: 'JWT Required'
      },
      liquidity: {
        base: '/api/liquidity',
        description: 'Liquidity provider operations',
        authentication: 'JWT Required'
      },
      admin: {
        base: '/api/admin',
        description: 'Admin panel for liquidity provider management',
        authentication: 'JWT + Admin Role Required'
      },
      webhooks: {
        base: '/api/webhooks',
        description: 'Webhook subscriptions for real-time notifications',
        authentication: 'API Key Required',
        features: ['subscribe', 'unsubscribe', 'test', 'list', 'stats']
      },
      public: {
        base: '/api/public',
        description: 'Public API for external integrations',
        authentication: 'API Key Required',
        rateLimit: '100 requests per 15 minutes'
      }
    },
    endpoints: {
      health: '/health',
      docs: process.env.NODE_ENV !== 'production' ? '/api-docs' : 'disabled',
      testCors: '/test-cors'
    },
    externalIntegration: {
      apiKeyRequired: true,
      supportedFormats: ['JSON', 'CSV'],
      realTimeUpdates: true,
      webhookEvents: ['balance_change', 'new_provider', 'provider_verified', 'large_transaction', 'system_alert'],
      examples: {
        webhook: 'curl -X POST /api/webhooks/subscribe -H "x-api-key: YOUR_KEY" -d \'{"url": "https://your-app.com/webhook", "events": ["balance_change"]}\'',
        stats: 'curl -H "x-api-key: YOUR_KEY" /api/public/liquidity/stats'
      }
    }
  });
});

// ✅ DEBUG: Test CORS endpoint
app.get('/test-cors', (req, res) => {
  console.log('🧪 CORS test endpoint called from:', req.headers.origin);
  res.status(200).json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    method: req.method,
    headers: {
      authorization: req.headers.authorization ? 'Present' : 'None',
      apiKey: req.headers['x-api-key'] ? 'Present' : 'None'
    },
    cors: {
      credentialsSupported: true,
      methodsAllowed: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      headersAllowed: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-API-Key']
    }
  });
});

// ✅ DATABASE: Connect with retry logic
let dbConnected = false;
const connectWithRetry = async (): Promise<void> => {
  try {
    await connectDB();
    dbConnected = true;
    console.log('✅ Database connected successfully');
  } catch (error: any) {
    console.error('❌ Database connection failed:', error?.message || String(error));
    setTimeout(connectWithRetry, 5000);
  }
};

// Start DB connection (non-blocking)
connectWithRetry();

// Middleware to check DB connection for API routes
app.use((req, res, next) => {
  if (!dbConnected && req.path.startsWith('/api/')) {
    console.log('⚠️ API request blocked - database not connected');
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable - database connecting'
    });
  }
  return next();
});

// ✅ SWAGGER: Development only with memory optimization
if (process.env.NODE_ENV !== 'production' && swaggerSpec) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ABOKI API Documentation',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));
  console.log('📚 Swagger API docs enabled at /api-docs');
} else {
  console.log('📚 Swagger API docs disabled');
}

// ✅ API ROUTES with enhanced logging
app.use('/api/auth', (req, res, next) => {
  console.log(`🔐 Auth route: ${req.method} ${req.path} from ${req.headers.origin || 'direct'}`);
  next();
}, authLimiter, authRoutes);

app.use('/api/liquidity', (req, res, next) => {
  console.log(`💧 Liquidity route: ${req.method} ${req.path} from ${req.headers.origin || 'direct'}`);
  next();
}, liquidityRoutes);

app.use('/api/admin', (req, res, next) => {
  console.log(`👑 Admin route: ${req.method} ${req.path} from ${req.headers.origin || 'direct'} - User: ${req.headers.authorization ? 'Authenticated' : 'Anonymous'}`);
  next();
}, adminRoutes);

// ✅ NEW: Webhook routes
app.use('/api/webhooks', (req, res, next) => {
  console.log(`📡 Webhook route: ${req.method} ${req.path} - API Key: ${req.headers['x-api-key'] ? 'Present' : 'Missing'} - Origin: ${req.headers.origin || 'direct'}`);
  next();
}, webhookRoutes);

// ✅ NEW: Public API routes (uncomment when you create publicApi.ts)
// app.use('/api/public', (req, res, next) => {
//   console.log(`🌐 Public API: ${req.method} ${req.path} - API Key: ${req.headers['x-api-key'] ? 'Present' : 'Missing'} - Origin: ${req.headers.origin || 'direct'}`);
//   next();
// }, publicApiRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// ✅ ENHANCED: Start server with comprehensive information
const server = app.listen(PORT, '0.0.0.0', () => {
  const memUsage = process.memoryUsage();
  const monitoringStatus = monitoringService.getStatus();
  
  console.log(`
🚀 ABOKI Liquidity Provider API Started (ENHANCED WITH WEBHOOKS)

📡 Server Details:
   Port: ${PORT} (binding to 0.0.0.0)
   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used
   Environment: ${process.env.NODE_ENV || 'development'}

🌐 CORS Configuration:
   Mode: ENHANCED (supports external API access)
   Allowed Origins: ${process.env.ALLOWED_ORIGINS || 'ALL (development)'}
   API Key Support: ${process.env.PUBLIC_API_KEYS ? '✅ Enabled' : '❌ Missing PUBLIC_API_KEYS'}

🔗 Available Endpoints:
   Health Check: http://localhost:${PORT}/health
   Root Info: http://localhost:${PORT}/
   CORS Test: http://localhost:${PORT}/test-cors
   
🔐 Authentication Endpoints:
   Auth: http://localhost:${PORT}/api/auth/*
   
💧 Liquidity Endpoints:
   Liquidity: http://localhost:${PORT}/api/liquidity/*
   
👑 Admin Endpoints:
   Admin Panel: http://localhost:${PORT}/api/admin/*
   
📡 Webhook Endpoints:
   Subscribe: POST http://localhost:${PORT}/api/webhooks/subscribe
   List: GET http://localhost:${PORT}/api/webhooks
   Test: POST http://localhost:${PORT}/api/webhooks/test/:id
   Stats: GET http://localhost:${PORT}/api/webhooks/stats

🌐 Public API Endpoints:
   Stats: GET http://localhost:${PORT}/api/public/liquidity/stats
   Providers: GET http://localhost:${PORT}/api/public/liquidity/providers

📡 Webhook Features:
   Real-time Notifications: ✅ Active
   Monitoring Service: ${monitoringStatus.isRunning ? '✅ Running' : '❌ Stopped'}
   API Key Authentication: ${process.env.PUBLIC_API_KEYS ? '✅ Required' : '❌ Not Configured'}
   Available Events: balance_change, new_provider, provider_verified, large_transaction, system_alert
   
📚 Documentation:
   Swagger UI: ${process.env.NODE_ENV !== 'production' ? `http://localhost:${PORT}/api-docs` : 'Production - docs disabled'}

🎯 External Integration Examples:
   
   Subscribe to Webhooks:
   curl -X POST http://localhost:${PORT}/api/webhooks/subscribe \\
     -H "x-api-key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"url": "https://your-app.com/webhook", "events": ["balance_change"]}'
   
   Get Liquidity Stats:
   curl -H "x-api-key: YOUR_API_KEY" \\
     http://localhost:${PORT}/api/public/liquidity/stats
   
   Test Webhook:
   curl -X POST http://localhost:${PORT}/api/webhooks/test/WEBHOOK_ID \\
     -H "x-api-key: YOUR_API_KEY"

⚠️ SETUP REQUIRED:
   ${process.env.PUBLIC_API_KEYS ? '✅ PUBLIC_API_KEYS configured' : '❌ Add PUBLIC_API_KEYS to your .env file'}
   
   Add to .env file:
   PUBLIC_API_KEYS=aboki-api-key-1,partner-key-2,dashboard-key-3
   ALLOWED_ORIGINS=https://your-dashboard.com,https://partner-site.com (optional)

🚨 IMPORTANT: Set strong API keys for production use!
  `);
});

// ✅ ERROR HANDLING
process.on('uncaughtException', (err: Error) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  
  // Stop monitoring service before shutdown
  monitoringService.stopMonitoring();
  
  server.close(() => {
    console.log('Server closed due to uncaught exception');
    process.exit(1);
  });
  
  setTimeout(() => {
    console.log('Forced exit after timeout');
    process.exit(1);
  }, 5000);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Stop monitoring service before shutdown
  monitoringService.stopMonitoring();
  
  server.close(() => {
    console.log('Server closed due to unhandled rejection');
    process.exit(1);
  });
});

// ✅ GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received - shutting down gracefully');
  
  // Stop monitoring service
  monitoringService.stopMonitoring();
  
  server.close(() => {
    console.log('✅ Process terminated gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received - shutting down gracefully');
  
  // Stop monitoring service
  monitoringService.stopMonitoring();
  
  server.close(() => {
    console.log('✅ Process terminated gracefully');
    process.exit(0);
  });
});

export default app;
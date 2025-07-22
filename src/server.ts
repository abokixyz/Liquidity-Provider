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
import { notFound, errorHandler } from './middleware/error';

const app = express();

// ✅ CRITICAL: Set port properly for Render
const PORT = parseInt(process.env.PORT || '5001', 10);

// Security middleware with minimal memory overhead
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ✅ TEMPORARY: Extremely permissive CORS for debugging
console.log('🚨 USING PERMISSIVE CORS FOR DEBUGGING');
app.use(cors({
  origin: true, // Allow ALL origins temporarily
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
}));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
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

// ✅ PRIORITY: Enhanced Health check endpoint
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
    corsEnabled: true,
    corsMode: 'permissive-debug',
    requestOrigin: req.headers.origin || 'none',
    userAgent: req.headers['user-agent'] || 'none'
  };
  
  console.log('🏥 Health check called:', healthData);
  res.status(200).json(healthData);
});

// ✅ ROOT: Minimal response
app.get('/', (req, res) => {
  console.log('🏠 Root endpoint called');
  res.status(200).json({
    success: true,
    message: 'ABOKI Liquidity Provider API',
    version: '1.0.0',
    port: PORT,
    corsEnabled: true
  });
});

// ✅ DEBUG: Test CORS endpoint
app.get('/test-cors', (req, res) => {
  console.log('🧪 CORS test endpoint called from:', req.headers.origin);
  res.status(200).json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    method: req.method
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
    explorer: false,
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      showExtensions: false,
      showCommonExtensions: false
    }
  }));
  console.log('📚 Swagger API docs enabled at /api-docs');
} else {
  console.log('📚 Swagger API docs disabled');
}

// API routes with logging
app.use('/api/auth', (req, res, next) => {
  console.log(`🔐 Auth route: ${req.method} ${req.path} from ${req.headers.origin}`);
  next();
}, authLimiter, authRoutes);

app.use('/api/liquidity', (req, res, next) => {
  console.log(`💧 Liquidity route: ${req.method} ${req.path} from ${req.headers.origin}`);
  next();
}, liquidityRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// ✅ CRITICAL: Start server with proper binding
const server = app.listen(PORT, '0.0.0.0', () => {
  const memUsage = process.memoryUsage();
  console.log(`
🚀 ABOKI Liquidity Provider API Started (DEBUG MODE)
📡 Port: ${PORT} (binding to 0.0.0.0)
💾 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 CORS Mode: PERMISSIVE (DEBUG - ALLOW ALL ORIGINS)
🔗 Frontend URL: ${process.env.FRONTEND_URL || 'not set'}
⚡ Health: https://liquidity-provider.onrender.com/health
🧪 CORS Test: https://liquidity-provider.onrender.com/test-cors
📚 API Docs: ${process.env.NODE_ENV !== 'production' ? `http://localhost:${PORT}/api-docs` : 'Production - docs disabled'}

🚨 IMPORTANT: This is a DEBUG version with permissive CORS!
   Replace with production CORS configuration after testing.
  `);
});

// ✅ ERROR HANDLING
process.on('uncaughtException', (err: Error) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  
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
  
  server.close(() => {
    console.log('Server closed due to unhandled rejection');
    process.exit(1);
  });
});

// ✅ GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received - shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received - shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated gracefully');
    process.exit(0);
  });
});

export default app;
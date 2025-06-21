import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

// Load environment variables FIRST
dotenv.config();

// Import swagger config with error handling - FIXED
let swaggerSpec: any = null;
try {
  // Use require since we're in CommonJS mode
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

// CORS configuration - optimized for memory
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5001',
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
}));

// ✅ MEMORY: Conservative rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
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
  max: 5,
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

// ✅ PRIORITY: Health check endpoint
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    port: PORT,
    memory: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ ROOT: Minimal response
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ABOKI Liquidity Provider API',
    version: '1.0.0',
    port: PORT
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
    // Retry after delay
    setTimeout(connectWithRetry, 5000);
  }
};

// Start DB connection (non-blocking)
connectWithRetry();

// Middleware to check DB connection for API routes
app.use((req, res, next) => {
  if (!dbConnected && req.path.startsWith('/api/')) {
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

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/liquidity', liquidityRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// ✅ CRITICAL: Start server with proper binding
const server = app.listen(PORT, '0.0.0.0', () => {
  const memUsage = process.memoryUsage();
  console.log(`
🚀 ABOKI Liquidity Provider API Started
📡 Port: ${PORT} (binding to 0.0.0.0)
💾 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used
🌍 Environment: ${process.env.NODE_ENV || 'development'}
⚡ Health: ${process.env.NODE_ENV === 'production' ? 'https://your-app.onrender.com/health' : `http://localhost:${PORT}/health`}
📚 API Docs: ${process.env.NODE_ENV !== 'production' ? `http://localhost:${PORT}/api-docs` : 'Production - docs disabled'}
  `);
});

// ✅ ERROR HANDLING: Clean error handling without GC forcing
process.on('uncaughtException', (err: Error) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  
  server.close(() => {
    console.log('Server closed due to uncaught exception');
    process.exit(1);
  });
  
  // Force exit after timeout
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

// ✅ MEMORY MONITORING: Simple monitoring without GC forcing
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    // Log memory usage
    console.log(`💾 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    
    // Warning thresholds
    if (heapUsedMB > 200) {
      console.warn(`⚠️  HIGH MEMORY WARNING: ${heapUsedMB}MB used`);
    }
    
    // Critical memory - restart
    if (heapUsedMB > 800) {
      console.error('🚨 CRITICAL MEMORY USAGE - Restarting server');
      server.close(() => process.exit(1));
    }
  }, 60000); // Check every minute
}

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
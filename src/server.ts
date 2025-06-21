import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';

// Load environment variables FIRST
dotenv.config();

import connectDB from './config/database';
import authRoutes from './routes/auth';
import liquidityRoutes from './routes/liquidity';
import { notFound, errorHandler } from './middleware/error';

const app = express();

// ✅ CRITICAL: Set port properly for Render (convert string to number)
const PORT = parseInt(process.env.PORT || '5001', 10);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  }
});

// ✅ MEMORY FIX: Reduce JSON limit to prevent memory issues
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint - MUST be early in middleware stack
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: PORT
  });
});

// ✅ ROOT ENDPOINT: Ensure this responds quickly
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to ABOKI Liquidity Provider API',
    version: '1.0.0',
    status: 'healthy',
    port: PORT
  });
});

// Connect to database (with error handling)
connectDB().catch(err => {
  console.error('Database connection failed:', err);
  // Don't crash the server, just log the error
});

// Swagger Documentation (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ABOKI Liquidity API Documentation'
  }));
}

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/liquidity', liquidityRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// ✅ CRITICAL: Start server and bind to all interfaces
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 ABOKI Liquidity Provider API running in ${process.env.NODE_ENV || 'development'} mode
📡 Server listening on port ${PORT}
🌐 Binding to 0.0.0.0:${PORT} for Render compatibility
💾 Memory limit: ${process.memoryUsage().heapTotal / 1024 / 1024}MB
📚 Health check: ${process.env.NODE_ENV === 'production' ? 'https://your-app.onrender.com/health' : `http://localhost:${PORT}/health`}
  `);
});

// ✅ MEMORY FIX: Handle memory issues gracefully
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  
  // Graceful shutdown
  server.close(() => {
    process.exit(1);
  });
  
  // Force exit if graceful shutdown fails
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => {
    process.exit(1);
  });
});

// ✅ MEMORY MONITORING: Log memory usage periodically
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    console.log(`💾 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    
    // Warning if memory usage is high
    if (heapUsedMB > 200) {
      console.warn('⚠️  High memory usage detected');
    }
  }, 60000); // Every minute
}

export default app;
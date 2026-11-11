// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { globalRateLimit } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import examinerRoutes from './routes/examiner';
import studentRoutes from './routes/student';
import adminRoutes from './routes/admin';
import healthRoutes from './routes/health';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting
app.use(globalRateLimit);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/examiner', examinerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', healthRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
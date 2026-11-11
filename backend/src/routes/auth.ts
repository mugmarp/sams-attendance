// backend/src/routes/auth.ts
import { Router } from 'express';
import { login, refresh, me } from '../controllers/auth';
import { validate } from '../middleware/validate';
import { loginSchema, refreshTokenSchema } from '../utils/validation';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';

const router = Router();

router.post('/login', authRateLimit, validate(loginSchema), login);
router.post('/refresh', authRateLimit, validate(refreshTokenSchema), refresh);
router.get('/me', authenticate, me);

export default router;
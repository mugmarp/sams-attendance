// backend/src/routes/examiner.ts
import { Router } from 'express';
import { 
  getTodaySessions, 
  getSession, 
  startSessionCheckin, 
  stopSessionCheckin, 
  getSessionAttendance 
} from '../controllers/examiner';
import { authenticate, requireExaminer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sessionIdParamSchema } from '../utils/validation';

const router = Router();

router.use(authenticate, requireExaminer);

router.get('/sessions/today', getTodaySessions);
router.get('/sessions/:id', validate(sessionIdParamSchema), getSession);
router.post('/sessions/:id/start-checkin', validate(sessionIdParamSchema), startSessionCheckin);
router.post('/sessions/:id/stop-checkin', validate(sessionIdParamSchema), stopSessionCheckin);
router.get('/sessions/:id/attendance', validate(sessionIdParamSchema), getSessionAttendance);

export default router;
// backend/src/routes/student.ts
import { Router } from 'express';
import { checkin, getAttendanceSummary, getUpcomingSessions } from '../controllers/student';
import { authenticate, requireStudent } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { checkinSchema } from '../utils/validation';
import { checkinRateLimit } from '../middleware/rateLimit';

const router = Router();

router.use(authenticate, requireStudent);

router.post('/checkin', checkinRateLimit, validate(checkinSchema), checkin);
router.get('/attendance/summary', getAttendanceSummary);
router.get('/sessions/upcoming', getUpcomingSessions);

export default router;
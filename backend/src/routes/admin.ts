// backend/src/routes/admin.ts
import { Router } from 'express';
import { 
  getEligibility, 
  exportEligibilityPDF, 
  getStudents, 
  getCourses, 
  getCourse 
} from '../controllers/admin';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { courseIdParamSchema, paginationQuerySchema } from '../utils/validation';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/eligibility/:courseId', validate(courseIdParamSchema), getEligibility);
router.get('/eligibility/:courseId/pdf', validate(courseIdParamSchema), exportEligibilityPDF);
router.get('/students', validate(paginationQuerySchema), getStudents);
router.get('/courses', getCourses);
router.get('/courses/:courseId', validate(courseIdParamSchema), getCourse);

export default router;
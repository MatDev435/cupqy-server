import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';

const router = Router();

router.get('/health', healthController.liveness);
router.get('/health/ready', healthController.readiness);

export default router;

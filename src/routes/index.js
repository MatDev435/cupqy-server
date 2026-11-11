import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };

const router = Router();

router.get('/', (_req, res) => {
  res.json({ data: { name: pkg.name, version: pkg.version, docs: '/api/docs' } });
});

export default router;

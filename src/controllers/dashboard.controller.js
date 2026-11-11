import * as dashboardService from '../services/dashboard.service.js';

export async function get(req, res) {
  const dashboard = await dashboardService.getDashboard(req.validated.query.period);
  res.set('Cache-Control', 'no-store');
  res.json({ data: dashboard });
}

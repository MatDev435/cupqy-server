import * as stockService from '../services/stock.service.js';
import { toStockOverviewResponse } from '../views/stock.view.js';

export async function overview(req, res) {
  const result = await stockService.getStockOverview(req.validated.query.date);
  res.json({ data: toStockOverviewResponse(result) });
}

export async function alerts(req, res) {
  const result = await stockService.getStockAlerts(req.validated.query.date);
  res.json({ data: toStockOverviewResponse(result) });
}

export async function setMany(req, res) {
  const result = await stockService.setStock(req.validated.body);
  res.json({ data: toStockOverviewResponse(result) });
}

export async function setOne(req, res) {
  const { date, quantity } = req.validated.body;
  const result = await stockService.setStock({
    date,
    items: [{ cupcakeId: req.validated.params.cupcakeId, quantity }],
  });
  res.json({ data: toStockOverviewResponse(result) });
}

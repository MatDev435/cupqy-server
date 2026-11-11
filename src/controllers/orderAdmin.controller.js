import * as orderAdminService from '../services/orderAdmin.service.js';
import { toAdminOrderSummary, toOrderDetail } from '../views/order.view.js';

export async function list(req, res) {
  const { items, meta } = await orderAdminService.listOrders(req.validated.query);
  res.json({ data: items.map(toAdminOrderSummary), meta });
}

export async function get(req, res) {
  const order = await orderAdminService.getOrder(req.validated.params.orderId);
  res.json({ data: toOrderDetail(order) });
}

export async function cancel(req, res) {
  const order = await orderAdminService.cancelOrder(
    req.user,
    req.validated.params.orderId,
    req.validated.body,
  );
  res.json({ data: toOrderDetail(order) });
}

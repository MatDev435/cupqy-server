import * as kitchenService from '../services/kitchen.service.js';
import { toKitchenOrder } from '../views/kitchen.view.js';

export async function list(req, res) {
  const { orders, summary } = await kitchenService.listKitchenOrders(req.validated.query);
  const now = new Date();
  res.json({ data: orders.map((order) => toKitchenOrder(order, now)), meta: { summary } });
}

export async function advance(req, res) {
  const order = await kitchenService.advanceOrder(
    req.user,
    req.validated.params.orderId,
    req.validated.body,
  );
  res.json({ data: toKitchenOrder(order) });
}

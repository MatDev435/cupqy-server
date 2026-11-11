import * as orderService from '../services/order.service.js';
import { toOrderDetail, toOrderSummary } from '../views/order.view.js';

export async function create(req, res) {
  const { order, checkout } = await orderService.createOrder(req.user, req.validated.body);
  res.status(201).json({ data: { ...toOrderDetail(order), checkout } });
}

export async function startPayment(req, res) {
  const { order, checkout } = await orderService.startPayment(
    req.user,
    req.validated.params.orderId,
  );
  res.status(201).json({ data: { ...toOrderDetail(order), checkout } });
}

export async function list(req, res) {
  const { items, meta } = await orderService.listMyOrders(req.user.id, req.validated.query);
  res.json({ data: items.map(toOrderSummary), meta });
}

export async function get(req, res) {
  const order = await orderService.getOrderForUser(req.user, req.validated.params.orderId);
  res.json({ data: toOrderDetail(order) });
}

export async function cancel(req, res) {
  const order = await orderService.cancelMyOrder(req.user, req.validated.params.orderId);
  res.json({ data: toOrderDetail(order) });
}

export async function syncPayment(req, res) {
  const order = await orderService.syncPayment(
    req.user,
    req.validated.params.orderId,
    req.validated.body,
  );
  res.json({ data: toOrderDetail(order) });
}

export async function reorder(req, res) {
  const cart = await orderService.buildReorderCart(req.user, req.validated.params.orderId);
  res.json({ data: cart });
}

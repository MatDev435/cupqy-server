import * as cartService from '../services/cart.service.js';

export async function validate(req, res) {
  const cart = await cartService.evaluateCart(req.validated.body.items);
  res.json({ data: cart });
}

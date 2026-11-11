import * as shippingService from '../services/shipping.service.js';
import * as storeService from '../services/store.service.js';

export function getStore(_req, res) {
  res.json({ data: storeService.getStoreInfo() });
}

export async function lookupCep(req, res) {
  const address = await shippingService.findAddressByCep(req.validated.params.cep);
  res.json({ data: address });
}

export async function quote(req, res) {
  const result = await shippingService.quote({ userId: req.user.id, ...req.validated.body });
  res.json({ data: result });
}

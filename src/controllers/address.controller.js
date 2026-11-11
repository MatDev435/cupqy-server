import * as addressService from '../services/address.service.js';
import { toAddressResponse } from '../views/address.view.js';

export async function list(req, res) {
  const addresses = await addressService.listAddresses(req.user.id);
  res.json({ data: addresses.map(toAddressResponse) });
}

export async function get(req, res) {
  const address = await addressService.getAddress(req.user.id, req.validated.params.addressId);
  res.json({ data: toAddressResponse(address) });
}

export async function create(req, res) {
  const address = await addressService.createAddress(req.user.id, req.validated.body);
  res.status(201).json({ data: toAddressResponse(address) });
}

export async function update(req, res) {
  const address = await addressService.updateAddress(
    req.user.id,
    req.validated.params.addressId,
    req.validated.body,
  );
  res.json({ data: toAddressResponse(address) });
}

export async function remove(req, res) {
  await addressService.deleteAddress(req.user.id, req.validated.params.addressId);
  res.status(204).end();
}

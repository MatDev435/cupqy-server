import { prisma } from '../config/prisma.js';
import * as addressModel from '../models/address.model.js';
import { AppError } from '../utils/AppError.js';

export const MAX_ADDRESSES_PER_USER = 10;

// Campos que, quando alterados, invalidam as coordenadas usadas no cálculo do frete.
const LOCATION_FIELDS = ['zipCode', 'street', 'number', 'neighborhood', 'city', 'state'];

function notFound() {
  return AppError.notFound('Endereço não encontrado.', 'ADDRESS_NOT_FOUND');
}

export function listAddresses(userId) {
  return addressModel.listByUser(userId);
}

export async function getAddress(userId, addressId) {
  const address = await addressModel.findByIdForUser(addressId, userId);
  if (!address) throw notFound();
  return address;
}

export async function createAddress(userId, data) {
  return prisma.$transaction(async (tx) => {
    const total = await addressModel.countByUser(userId, tx);
    if (total >= MAX_ADDRESSES_PER_USER) {
      throw AppError.unprocessable(
        `Você pode salvar até ${MAX_ADDRESSES_PER_USER} endereços.`,
        'ADDRESS_LIMIT_REACHED',
      );
    }

    // O primeiro endereço salvo vira o padrão automaticamente.
    const isDefault = data.isDefault === true || total === 0;
    if (isDefault) await addressModel.clearDefault(userId, tx);

    return addressModel.create({ ...data, userId, isDefault }, tx);
  });
}

export async function updateAddress(userId, addressId, data) {
  return prisma.$transaction(async (tx) => {
    const address = await addressModel.findByIdForUser(addressId, userId, tx);
    if (!address) throw notFound();

    const changes = { ...data };
    if (
      LOCATION_FIELDS.some((field) => data[field] !== undefined && data[field] !== address[field])
    ) {
      changes.latitude = null;
      changes.longitude = null;
    }

    if (data.isDefault === true && !address.isDefault) {
      await addressModel.clearDefault(userId, tx);
    }

    return addressModel.update(addressId, changes, tx);
  });
}

export async function deleteAddress(userId, addressId) {
  await prisma.$transaction(async (tx) => {
    const address = await addressModel.findByIdForUser(addressId, userId, tx);
    if (!address) throw notFound();

    await addressModel.remove(addressId, tx);

    // Se o endereço padrão foi removido, o mais recente passa a ser o padrão.
    if (address.isDefault) {
      const next = await addressModel.findMostRecent(userId, tx);
      if (next) await addressModel.update(next.id, { isDefault: true }, tx);
    }
  });
}

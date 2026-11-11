import { config } from '../config/env.js';

/** Informações públicas da loja usadas no checkout (retirada e regras de frete). */
export function getStoreInfo() {
  return {
    name: config.store.name,
    address: config.store.address,
    timeZone: config.store.timeZone,
    pickup: { feeCents: 0, estimatedMinutes: config.store.preparationMinutes },
    delivery: {
      baseFeeCents: config.delivery.baseFeeCents,
      feePerKmCents: config.delivery.feePerKmCents,
      maxDistanceKm: config.delivery.maxDistanceKm,
    },
  };
}

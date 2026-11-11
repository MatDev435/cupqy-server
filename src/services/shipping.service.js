import { config } from '../config/env.js';
import * as addressModel from '../models/address.model.js';
import { AppError } from '../utils/AppError.js';
import { haversineKm } from '../utils/geo.js';
import { ExternalServiceError } from '../utils/http.js';
import { lookupCep } from './geo/cep.service.js';
import { geocodeAddress } from './geo/geocoding.service.js';

/** Cópia do endereço gravada no pedido (o endereço salvo pode mudar depois). */
export function toAddressSnapshot(address) {
  return {
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    complement: address.complement ?? null,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
  };
}

/**
 * Calcula frete e prazo a partir das coordenadas do cliente (US09 — RN#02).
 * distância = linha reta (Haversine) × fator de rota; frete = taxa base + valor por km.
 */
export function quoteFromCoordinates(location, settings = config.delivery) {
  const store = { latitude: config.store.latitude, longitude: config.store.longitude };
  const distanceKm = Math.round(haversineKm(store, location) * settings.routeFactor * 10) / 10;

  if (distanceKm > settings.maxDistanceKm) {
    throw AppError.unprocessable(
      `Endereço fora da área de entrega (máximo de ${settings.maxDistanceKm} km).`,
      'DELIVERY_OUT_OF_RANGE',
      { distanceKm, maxDistanceKm: settings.maxDistanceKm },
    );
  }

  return {
    distanceKm,
    feeCents: Math.round(settings.baseFeeCents + distanceKm * settings.feePerKmCents),
    estimatedMinutes:
      config.store.preparationMinutes + Math.ceil((distanceKm / settings.averageSpeedKmh) * 60),
  };
}

async function locate(address) {
  let location;
  try {
    location = await geocodeAddress(address);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw AppError.serviceUnavailable(
        'Não foi possível calcular o frete agora. Tente novamente em instantes.',
        'GEOCODING_UNAVAILABLE',
      );
    }
    throw error;
  }
  if (!location) {
    throw AppError.unprocessable(
      'Não foi possível localizar o endereço informado. Confira o CEP e o número.',
      'ADDRESS_NOT_LOCATED',
    );
  }
  return location;
}

/**
 * Cotação de entrega ou retirada (US09). Usado pela cotação e, de novo, no checkout —
 * o valor do frete nunca vem do front-end.
 *
 * @param {{ userId: string, fulfillmentType: 'DELIVERY' | 'PICKUP', addressId?: string, address?: object }} input
 */
export async function quote({ userId, fulfillmentType, addressId, address }) {
  if (fulfillmentType === 'PICKUP') {
    return {
      fulfillmentType,
      feeCents: 0,
      distanceKm: null,
      estimatedMinutes: config.store.preparationMinutes,
      pickupAddress: config.store.address,
      deliveryAddress: null,
    };
  }

  let snapshot;
  let location;

  if (addressId) {
    const saved = await addressModel.findByIdForUser(addressId, userId);
    if (!saved) throw AppError.notFound('Endereço não encontrado.', 'ADDRESS_NOT_FOUND');
    snapshot = toAddressSnapshot(saved);

    if (saved.latitude !== null && saved.longitude !== null) {
      location = { latitude: saved.latitude, longitude: saved.longitude };
    } else {
      location = await locate(saved);
      // Guarda as coordenadas para não consultar os serviços externos de novo.
      await addressModel.update(saved.id, location);
    }
  } else {
    snapshot = toAddressSnapshot(address);
    location = await locate(address);
  }

  return {
    fulfillmentType,
    ...quoteFromCoordinates(location),
    pickupAddress: null,
    deliveryAddress: snapshot,
  };
}

/** Autocompletar endereço pelo CEP (US09 — RNF#02). */
export async function findAddressByCep(cep) {
  let result;
  try {
    result = await lookupCep(cep);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw AppError.serviceUnavailable(
        'Serviço de consulta de CEP indisponível. Preencha o endereço manualmente.',
        'CEP_SERVICE_UNAVAILABLE',
      );
    }
    throw error;
  }
  if (!result) throw AppError.notFound('CEP não encontrado.', 'CEP_NOT_FOUND');

  return {
    zipCode: result.zipCode,
    street: result.street,
    neighborhood: result.neighborhood,
    city: result.city,
    state: result.state,
  };
}

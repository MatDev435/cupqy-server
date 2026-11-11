import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ExternalServiceError, getJson } from '../../utils/http.js';
import { lookupCep } from './cep.service.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map();

function cacheKey(address) {
  return [address.zipCode, address.street, address.number, address.city, address.state]
    .map((part) =>
      String(part ?? '')
        .trim()
        .toLowerCase(),
    )
    .join('|');
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.location;
}

function writeCache(key, location) {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { location, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearGeocodingCache() {
  cache.clear();
}

async function geocodeWithNominatim(address) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br',
    street: `${address.number} ${address.street}`,
    city: address.city,
    state: address.state,
    postalcode: `${address.zipCode.slice(0, 5)}-${address.zipCode.slice(5)}`,
  });

  const { data } = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    timeoutMs: config.externalApis.timeoutMs,
    headers: { 'User-Agent': config.externalApis.geocodingUserAgent },
  });

  const match = Array.isArray(data) ? data[0] : null;
  if (!match) return null;
  const latitude = Number.parseFloat(match.lat);
  const longitude = Number.parseFloat(match.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/**
 * Converte um endereço em coordenadas.
 * 1) Coordenadas do CEP (BrasilAPI); 2) busca pelo endereço completo (Nominatim/OpenStreetMap).
 *
 * @returns {Promise<{ latitude: number, longitude: number } | null>} null se não localizado
 * @throws {ExternalServiceError} quando todos os provedores falharam
 */
export async function geocodeAddress(address) {
  const key = cacheKey(address);
  const cached = readCache(key);
  if (cached) return cached;

  let failures = 0;
  const attempts = [
    async () => (await lookupCep(address.zipCode))?.location ?? null,
    () => geocodeWithNominatim(address),
  ];

  for (const attempt of attempts) {
    try {
      const location = await attempt();
      if (location) {
        writeCache(key, location);
        return location;
      }
    } catch (error) {
      failures += 1;
      logger.warn({ err: error }, 'Falha na geocodificação do endereço');
    }
  }

  if (failures === attempts.length) {
    throw new ExternalServiceError('Nenhum serviço de geocodificação respondeu');
  }
  return null;
}

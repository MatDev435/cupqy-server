import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteFromCoordinates } from '../../../src/services/shipping.service.js';
import { lookupCep } from '../../../src/services/geo/cep.service.js';
import {
  clearGeocodingCache,
  geocodeAddress,
} from '../../../src/services/geo/geocoding.service.js';
import { haversineKm } from '../../../src/utils/geo.js';
import { ExternalServiceError, getJson } from '../../../src/utils/http.js';
import { geoFixtures, routeFetch } from '../../helpers/fakeHttp.js';

vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

const settings = {
  baseFeeCents: 500,
  feePerKmCents: 150,
  maxDistanceKm: 15,
  routeFactor: 1.3,
  averageSpeedKmh: 25,
};

const address = {
  zipCode: '01310100',
  street: 'Avenida Paulista',
  number: '1000',
  city: 'São Paulo',
  state: 'SP',
};

describe('cálculo de frete', () => {
  it('Haversine: São Paulo → Rio de Janeiro ≈ 360 km em linha reta', () => {
    const km = haversineKm(
      { latitude: -23.5505, longitude: -46.6333 },
      { latitude: -22.9068, longitude: -43.1729 },
    );
    expect(km).toBeGreaterThan(355);
    expect(km).toBeLessThan(365);
  });

  it('aplica fator de rota, taxa base, valor por km e prazo', () => {
    expect(quoteFromCoordinates({ latitude: -23.565, longitude: -46.652 }, settings)).toEqual({
      distanceKm: 1.9,
      feeCents: 785,
      estimatedMinutes: 35,
    });
    expect(quoteFromCoordinates({ latitude: -23.65, longitude: -46.7 }, settings)).toEqual({
      distanceKm: 14.5,
      feeCents: 2675,
      estimatedMinutes: 65,
    });
  });

  it('recusa endereços fora do raio de entrega', () => {
    expect(() =>
      quoteFromCoordinates({ latitude: -22.9068, longitude: -43.1729 }, settings),
    ).toThrowError(expect.objectContaining({ code: 'DELIVERY_OUT_OF_RANGE', statusCode: 422 }));
  });
});

describe('APIs externas de CEP e geocodificação', () => {
  beforeEach(() => clearGeocodingCache());
  afterEach(() => vi.unstubAllGlobals());

  it('getJson: 4xx retorna data nula; 5xx, timeout ou rede lançam ExternalServiceError', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['https://x.test/404', () => ({ status: 404 })],
        ['https://x.test/500', () => ({ status: 500 })],
      ]),
    );

    await expect(getJson('https://x.test/404', { timeoutMs: 100 })).resolves.toEqual({
      status: 404,
      data: null,
    });
    await expect(getJson('https://x.test/500', { timeoutMs: 100 })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(getJson('https://offline.test', { timeoutMs: 100 })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  it('usa a ViaCEP quando a BrasilAPI falha', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['https://brasilapi.com.br', () => ({ status: 503 })],
        ['https://viacep.com.br', () => ({ body: geoFixtures.viaCep })],
      ]),
    );

    await expect(lookupCep('01310100')).resolves.toMatchObject({
      zipCode: '01310100',
      street: 'Avenida Paulista',
      city: 'São Paulo',
      location: null,
    });
  });

  it('retorna null para CEP inexistente e lança erro quando todos os provedores falham', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['https://brasilapi.com.br', () => ({ status: 404 })],
        ['https://viacep.com.br', () => ({ body: { erro: 'true' } })],
      ]),
    );
    await expect(lookupCep('99999999')).resolves.toBeNull();

    vi.stubGlobal('fetch', routeFetch([]));
    await expect(lookupCep('01310100')).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('geocodifica pelo CEP e guarda o resultado em cache', async () => {
    const fetchMock = routeFetch([
      ['https://brasilapi.com.br', () => ({ body: geoFixtures.brasilApiNearby })],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const first = await geocodeAddress(address);
    const second = await geocodeAddress(address);

    expect(first).toEqual({ latitude: -23.565, longitude: -46.652 });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recorre ao Nominatim (com User-Agent) quando o CEP não tem coordenadas', async () => {
    const fetchMock = routeFetch([
      ['https://brasilapi.com.br', () => ({ body: geoFixtures.brasilApiWithoutCoordinates })],
      ['https://nominatim.openstreetmap.org', () => ({ body: [{ lat: '-23.58', lon: '-46.68' }] })],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocodeAddress({ ...address, zipCode: '04538133' })).resolves.toEqual({
      latitude: -23.58,
      longitude: -46.68,
    });
    const [nominatimUrl, options] = fetchMock.mock.calls[1];
    expect(String(nominatimUrl)).toContain('street=1000+Avenida+Paulista');
    expect(options.headers['User-Agent']).toBe('cupqy-server/1.0');
  });
});

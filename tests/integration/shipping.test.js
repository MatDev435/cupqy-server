import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { geoFixtures, routeFetch } from '../helpers/fakeHttp.js';
import { clearGeocodingCache } from '../../src/services/geo/geocoding.service.js';

const app = createApp();

const inlineAddress = {
  zipCode: '01310-100',
  street: 'Avenida Paulista',
  number: '1000',
  complement: 'Apto 12',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
};

function mockGeoApis(overrides = {}) {
  const fetchMock = routeFetch([
    [
      'https://brasilapi.com.br',
      overrides.brasilApi ?? (() => ({ body: geoFixtures.brasilApiNearby })),
    ],
    ['https://viacep.com.br', overrides.viaCep ?? (() => ({ body: geoFixtures.viaCep }))],
    ['https://nominatim.openstreetmap.org', overrides.nominatim ?? (() => ({ body: [] }))],
  ]);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Loja e frete', () => {
  let customer;

  beforeEach(async () => {
    await resetDatabase();
    clearGeocodingCache();
    customer = await createUser();
  });

  const quote = (body) =>
    request(app)
      .post('/api/v1/shipping/quote')
      .set('Authorization', customer.authHeader)
      .send(body);

  it('GET /store expõe endereço da loja, prazo de retirada e regras de frete', async () => {
    const response = await request(app).get('/api/v1/store');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Cupqy',
      pickup: { feeCents: 0, estimatedMinutes: 30 },
      delivery: { baseFeeCents: 500, feePerKmCents: 150, maxDistanceKm: 15 },
    });
  });

  describe('GET /shipping/cep/:cep', () => {
    it('autocompleta o endereço pelo CEP', async () => {
      mockGeoApis();
      const response = await request(app).get('/api/v1/shipping/cep/01310-100');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        zipCode: '01310100',
        street: 'Avenida Paulista',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      });
    });

    it('responde 404 para CEP inexistente e 503 quando os serviços estão fora', async () => {
      mockGeoApis({ brasilApi: () => ({ status: 404 }), viaCep: () => ({ body: { erro: true } }) });
      expect((await request(app).get('/api/v1/shipping/cep/99999999')).body.error.code).toBe(
        'CEP_NOT_FOUND',
      );

      mockGeoApis({ brasilApi: () => ({ status: 500 }), viaCep: () => ({ status: 502 }) });
      expect((await request(app).get('/api/v1/shipping/cep/01310100')).status).toBe(503);
    });

    it('valida o formato do CEP', async () => {
      expect((await request(app).get('/api/v1/shipping/cep/123')).status).toBe(400);
    });
  });

  describe('POST /shipping/quote', () => {
    it('exige autenticação', async () => {
      const response = await request(app)
        .post('/api/v1/shipping/quote')
        .send({ fulfillmentType: 'PICKUP' });
      expect(response.status).toBe(401);
    });

    it('retirada na loja tem frete zero (US09 RN#01)', async () => {
      const response = await quote({ fulfillmentType: 'PICKUP' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        fulfillmentType: 'PICKUP',
        feeCents: 0,
        estimatedMinutes: 30,
        deliveryAddress: null,
      });
      expect(response.body.data.pickupAddress).toContain('São Paulo');
    });

    it('calcula frete por distância para um endereço informado (US09 RN#02)', async () => {
      mockGeoApis();
      const response = await quote({ fulfillmentType: 'DELIVERY', address: inlineAddress });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        fulfillmentType: 'DELIVERY',
        distanceKm: 1.9,
        feeCents: 785,
        estimatedMinutes: 35,
        deliveryAddress: { zipCode: '01310100', number: '1000', complement: 'Apto 12' },
      });
    });

    it('usa endereço salvo e guarda as coordenadas para as próximas cotações', async () => {
      const saved = await prisma.address.create({
        data: { ...inlineAddress, zipCode: '01310100', userId: customer.id },
      });
      const fetchMock = mockGeoApis();

      await quote({ fulfillmentType: 'DELIVERY', addressId: saved.id }).expect(200);
      clearGeocodingCache();
      const second = await quote({ fulfillmentType: 'DELIVERY', addressId: saved.id });

      expect(second.body.data.feeCents).toBe(785);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const stored = await prisma.address.findUnique({ where: { id: saved.id } });
      expect(stored).toMatchObject({ latitude: -23.565, longitude: -46.652 });
    });

    it('recusa endereços fora da área de entrega', async () => {
      mockGeoApis({
        brasilApi: () => ({
          body: {
            ...geoFixtures.brasilApiNearby,
            location: { coordinates: { latitude: '-22.9068', longitude: '-43.1729' } },
          },
        }),
      });

      const response = await quote({ fulfillmentType: 'DELIVERY', address: inlineAddress });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'DELIVERY_OUT_OF_RANGE',
        details: { maxDistanceKm: 15 },
      });
    });

    it('diferencia endereço não localizado (422) de serviços indisponíveis (503)', async () => {
      mockGeoApis({
        brasilApi: () => ({ body: geoFixtures.brasilApiWithoutCoordinates }),
        nominatim: () => ({ body: [] }),
      });
      const notLocated = await quote({ fulfillmentType: 'DELIVERY', address: inlineAddress });
      expect(notLocated.status).toBe(422);
      expect(notLocated.body.error.code).toBe('ADDRESS_NOT_LOCATED');

      mockGeoApis({
        brasilApi: () => ({ status: 500 }),
        viaCep: () => ({ status: 500 }),
        nominatim: () => ({ status: 503 }),
      });
      const unavailable = await quote({ fulfillmentType: 'DELIVERY', address: inlineAddress });
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error.code).toBe('GEOCODING_UNAVAILABLE');
    });

    it('não permite usar endereço salvo de outro usuário', async () => {
      const other = await createUser();
      const foreign = await prisma.address.create({
        data: { ...inlineAddress, zipCode: '01310100', userId: other.id },
      });

      const response = await quote({ fulfillmentType: 'DELIVERY', addressId: foreign.id });
      expect(response.status).toBe(404);
    });

    it('exige exatamente uma forma de endereço para entrega', async () => {
      const both = await quote({
        fulfillmentType: 'DELIVERY',
        addressId: crypto.randomUUID(),
        address: inlineAddress,
      });
      const none = await quote({ fulfillmentType: 'DELIVERY' });
      const unknownType = await quote({ fulfillmentType: 'DRONE' });

      expect(both.status).toBe(400);
      expect(none.status).toBe(400);
      expect(unknownType.status).toBe(400);
    });
  });
});

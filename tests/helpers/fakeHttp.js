import { vi } from 'vitest';

/** Fetch padrão dos testes: qualquer acesso à rede externa falha (testes nunca usam a internet). */
export const blockedFetch = vi.fn(async (input) => {
  throw new TypeError(`fetch failed: acesso à rede bloqueado nos testes (${String(input)})`);
});

/**
 * Cria um fetch simulado que responde conforme as rotas informadas.
 * @param {Array<[string | RegExp, (url: string) => ({ status?: number, body?: unknown } | Promise<...>)]>} routes
 */
export function routeFetch(routes) {
  return vi.fn(async (input) => {
    const url = String(input);
    for (const [match, respond] of routes) {
      const matches = typeof match === 'string' ? url.startsWith(match) : match.test(url);
      if (matches) {
        const { status = 200, body = null } = await respond(url);
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    throw new TypeError(`fetch failed: rota não simulada (${url})`);
  });
}

export const geoFixtures = {
  /** Resposta da BrasilAPI v2 para um CEP próximo à loja (≈1,9 km de trajeto). */
  brasilApiNearby: {
    cep: '01310100',
    state: 'SP',
    city: 'São Paulo',
    neighborhood: 'Bela Vista',
    street: 'Avenida Paulista',
    service: 'open-cep',
    location: { type: 'Point', coordinates: { latitude: '-23.5650', longitude: '-46.6520' } },
  },
  brasilApiWithoutCoordinates: {
    cep: '04538133',
    state: 'SP',
    city: 'São Paulo',
    neighborhood: 'Itaim Bibi',
    street: 'Avenida Brigadeiro Faria Lima',
    service: 'viacep',
    location: { type: 'Point', coordinates: {} },
  },
  viaCep: {
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    bairro: 'Bela Vista',
    localidade: 'São Paulo',
    uf: 'SP',
  },
};

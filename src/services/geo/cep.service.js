import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ExternalServiceError, getJson } from '../../utils/http.js';

function parseCoordinate(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function fromBrasilApi(data) {
  const latitude = parseCoordinate(data.location?.coordinates?.latitude);
  const longitude = parseCoordinate(data.location?.coordinates?.longitude);
  return {
    zipCode: String(data.cep).replace(/\D/g, ''),
    street: data.street || null,
    neighborhood: data.neighborhood || null,
    city: data.city,
    state: data.state,
    location: latitude !== null && longitude !== null ? { latitude, longitude } : null,
  };
}

function fromViaCep(data) {
  return {
    zipCode: String(data.cep).replace(/\D/g, ''),
    street: data.logradouro || null,
    neighborhood: data.bairro || null,
    city: data.localidade,
    state: data.uf,
    location: null,
  };
}

const PROVIDERS = [
  {
    name: 'brasilapi',
    url: (cep) => `https://brasilapi.com.br/api/cep/v2/${cep}`,
    parse: (data) => (data?.city ? fromBrasilApi(data) : null),
  },
  {
    name: 'viacep',
    url: (cep) => `https://viacep.com.br/ws/${cep}/json/`,
    parse: (data) => (data && !data.erro && data.localidade ? fromViaCep(data) : null),
  },
];

/**
 * Consulta um CEP (BrasilAPI → ViaCEP como alternativa).
 * @returns {Promise<object | null>} null quando o CEP não existe
 * @throws {ExternalServiceError} quando nenhum provedor respondeu
 */
export async function lookupCep(cep) {
  let failures = 0;

  for (const provider of PROVIDERS) {
    try {
      const { data } = await getJson(provider.url(cep), {
        timeoutMs: config.externalApis.timeoutMs,
      });
      const address = provider.parse(data);
      if (address) return address;
    } catch (error) {
      failures += 1;
      logger.warn({ err: error, provider: provider.name }, 'Falha na consulta de CEP');
    }
  }

  if (failures === PROVIDERS.length) {
    throw new ExternalServiceError('Nenhum serviço de CEP respondeu');
  }
  return null;
}

/** Falha de rede, timeout ou erro 5xx de um serviço externo. */
export class ExternalServiceError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'ExternalServiceError';
    this.status = status;
  }
}

/**
 * GET em uma API JSON externa com timeout.
 * - 2xx → { status, data }
 * - 4xx → { status, data: null } (ex.: CEP inexistente)
 * - rede/timeout/5xx → lança ExternalServiceError
 */
export async function getJson(url, { timeoutMs, headers = {} }) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ExternalServiceError(`Falha ao acessar ${new URL(url).host}`, { cause: error });
  }

  if (response.status >= 500) {
    throw new ExternalServiceError(`${new URL(url).host} respondeu ${response.status}`, {
      status: response.status,
    });
  }
  if (!response.ok) return { status: response.status, data: null };

  try {
    return { status: response.status, data: await response.json() };
  } catch (error) {
    throw new ExternalServiceError(`Resposta inválida de ${new URL(url).host}`, { cause: error });
  }
}

import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';

describe('parseEnv', () => {
  it('aplica valores padrão seguros quando as variáveis opcionais não são informadas', () => {
    const config = parseEnv({});

    expect(config.env).toBe('development');
    expect(config.server.port).toBe(3333);
    expect(config.server.trustProxy).toBe(1);
    expect(config.server.forceHttps).toBe(false);
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
    expect(config.rateLimit.enabled).toBe(true);
    expect(config.logLevel).toBe('debug');
  });

  it('força HTTPS e nível de log "info" por padrão em produção', () => {
    const config = parseEnv({ NODE_ENV: 'production' });

    expect(config.isProduction).toBe(true);
    expect(config.server.forceHttps).toBe(true);
    expect(config.logLevel).toBe('info');
  });

  it('interpreta listas separadas por vírgula, booleanos e números', () => {
    const config = parseEnv({
      PORT: '8080',
      CORS_ORIGINS: 'https://cupqy.vercel.app, https://cupqy-*.vercel.app ,',
      RATE_LIMIT_ENABLED: 'false',
      RATE_LIMIT_WINDOW_MINUTES: '5',
      TRUST_PROXY: 'loopback',
    });

    expect(config.server.port).toBe(8080);
    expect(config.cors.origins).toEqual(['https://cupqy.vercel.app', 'https://cupqy-*.vercel.app']);
    expect(config.rateLimit.enabled).toBe(false);
    expect(config.rateLimit.windowMs).toBe(5 * 60 * 1000);
    expect(config.server.trustProxy).toBe('loopback');
  });

  it('lança erro listando as variáveis inválidas sem expor seus valores', () => {
    let message = '';
    try {
      parseEnv({ PORT: 'abc', NODE_ENV: 'staging' });
    } catch (error) {
      message = error.message;
    }

    expect(message).toMatch(/^Variáveis de ambiente inválidas:/);
    expect(message).toContain('PORT');
    expect(message).toContain('NODE_ENV');
    expect(message).not.toContain('abc');
    expect(message).not.toContain('staging');
  });
});

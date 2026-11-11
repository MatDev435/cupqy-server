import { describe, expect, it } from 'vitest';
import { buildCorsOptions, toOriginMatcher } from '../../../src/middlewares/cors.js';

function checkOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => (error ? reject(error) : resolve(allowed)));
  });
}

describe('toOriginMatcher', () => {
  it('compara origens exatas ignorando barra final na configuração', () => {
    const matches = toOriginMatcher('https://cupqy.vercel.app/');
    expect(matches('https://cupqy.vercel.app')).toBe(true);
    expect(matches('https://evil.vercel.app')).toBe(false);
  });

  it('aceita curingas para previews da Vercel sem permitir domínios arbitrários', () => {
    const matches = toOriginMatcher('https://cupqy-*.vercel.app');
    expect(matches('https://cupqy-git-feature-x.vercel.app')).toBe(true);
    expect(matches('https://cupqy-abc.vercel.app.evil.com')).toBe(false);
    expect(matches('https://cupqy-a.b.vercel.app')).toBe(false);
  });
});

describe('buildCorsOptions', () => {
  it('libera origens configuradas e requisições sem Origin', async () => {
    const options = buildCorsOptions(['http://localhost:5173']);
    await expect(checkOrigin(options, 'http://localhost:5173')).resolves.toBe(true);
    await expect(checkOrigin(options, undefined)).resolves.toBe(true);
  });

  it('nega origens não configuradas', async () => {
    const options = buildCorsOptions(['http://localhost:5173']);
    await expect(checkOrigin(options, 'https://malicioso.com')).resolves.toBe(false);
  });
});

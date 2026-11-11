import { describe, expect, it, vi } from 'vitest';
import * as storageService from '../../../src/services/storage.service.js';
import { supabaseAdmin } from '../../../src/config/supabase.js';

const bucketApi = {
  createSignedUploadUrl: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
};

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { storage: { from: vi.fn(() => bucketApi) } },
}));

describe('storage.service', () => {
  it('monta a URL pública codificando cada segmento do caminho', () => {
    expect(storageService.getPublicUrl('cupcakes/a b/ç.webp')).toBe(
      'http://127.0.0.1:1/supabase-not-used-in-tests/storage/v1/object/public/cupcake-images/cupcakes/a%20b/%C3%A7.webp',
    );
    expect(storageService.getPublicUrl(null)).toBeNull();
  });

  it('gera caminho do servidor com extensão conforme o tipo', async () => {
    bucketApi.createSignedUploadUrl.mockImplementation(async (path) => ({
      data: { path, token: 't', signedUrl: 'https://x' },
      error: null,
    }));

    const upload = await storageService.createCupcakeImageUpload('abc', 'image/jpeg');

    expect(supabaseAdmin.storage.from).toHaveBeenCalledWith('cupcake-images');
    expect(upload.path).toMatch(/^cupcakes\/abc\/[0-9a-f-]{36}\.jpg$/);
  });

  it('responde 502 quando o Storage falha ao gerar a URL', async () => {
    bucketApi.createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(storageService.createCupcakeImageUpload('abc', 'image/png')).rejects.toMatchObject(
      {
        statusCode: 502,
        code: 'STORAGE_ERROR',
      },
    );
  });

  it('diferencia arquivo inexistente de falha do Storage', async () => {
    bucketApi.info.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error('Object not found'), { statusCode: '404' }),
    });
    await expect(storageService.getObjectInfo('x')).resolves.toBeNull();

    bucketApi.info.mockResolvedValueOnce({ data: null, error: new Error('Internal error') });
    await expect(storageService.getObjectInfo('x')).rejects.toMatchObject({ statusCode: 502 });

    bucketApi.info.mockRejectedValueOnce(new Error('network'));
    await expect(storageService.getObjectInfo('x')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('não interrompe o fluxo quando a remoção falha', async () => {
    bucketApi.remove.mockRejectedValueOnce(new Error('network'));
    await expect(storageService.removeObjects(['a.webp'])).resolves.toBeUndefined();

    await storageService.removeObjects([null, undefined]);
    expect(bucketApi.remove).toHaveBeenCalledTimes(1);
  });
});

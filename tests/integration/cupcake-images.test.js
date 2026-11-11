import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake } from '../helpers/factories.js';
import { fakeStorage } from '../helpers/fakeSupabase.js';

const app = createApp();
const BUCKET = 'cupcake-images';

describe('Imagens dos cupcakes (Supabase Storage)', () => {
  let admin;
  let cupcake;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN' });
    cupcake = await createCupcake();
  });

  const asAdmin = (method, path) => {
    const agent = request(app);
    return agent[method](`/api/v1/admin/cupcakes/${cupcake.id}${path}`).set(
      'Authorization',
      admin.authHeader,
    );
  };

  async function uploadImage(metadata) {
    const upload = await asAdmin('post', '/image/upload-url').send({
      contentType: 'image/webp',
      sizeBytes: 200_000,
    });
    // Simula o front-end enviando o arquivo diretamente ao Storage com a URL assinada.
    fakeStorage.put(BUCKET, upload.body.data.path, metadata);
    return upload.body.data;
  }

  it('gera URL assinada com caminho definido pelo servidor', async () => {
    const response = await asAdmin('post', '/image/upload-url').send({
      contentType: 'image/png',
      sizeBytes: 1_000_000,
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      bucket: BUCKET,
      contentType: 'image/png',
      maxSizeBytes: 5 * 1024 * 1024,
      expiresInSeconds: 7200,
      token: expect.any(String),
      signedUrl: expect.stringContaining('/upload/sign/'),
    });
    expect(response.body.data.path).toMatch(
      new RegExp(`^cupcakes/${cupcake.id}/[0-9a-f-]{36}\\.png$`),
    );
  });

  it('valida formato e tamanho antes de gerar a URL', async () => {
    const gif = await asAdmin('post', '/image/upload-url').send({
      contentType: 'image/gif',
      sizeBytes: 10,
    });
    const huge = await asAdmin('post', '/image/upload-url').send({
      contentType: 'image/jpeg',
      sizeBytes: 6 * 1024 * 1024,
    });

    expect(gif.status).toBe(400);
    expect(gif.body.error.details[0].message).toBe(
      'Formato não suportado. Envie JPG, PNG ou WebP.',
    );
    expect(huge.status).toBe(400);
  });

  it('vincula a imagem enviada e expõe a URL pública no catálogo', async () => {
    const upload = await uploadImage({ size: 200_000, mimetype: 'image/webp' });

    const response = await asAdmin('put', '/image').send({ path: upload.path });

    expect(response.status).toBe(200);
    expect(response.body.data.imagePath).toBe(upload.path);
    const publicCard = await request(app).get(`/api/v1/cupcakes/${cupcake.id}`);
    expect(publicCard.body.data.imageUrl).toContain(`/object/public/${BUCKET}/${upload.path}`);
  });

  it('substitui a imagem e remove o arquivo anterior', async () => {
    const first = await uploadImage();
    await asAdmin('put', '/image').send({ path: first.path });
    const second = await uploadImage();

    await asAdmin('put', '/image').send({ path: second.path }).expect(200);

    expect(fakeStorage.removed()).toEqual([first.path]);
    const stored = await prisma.cupcake.findUnique({ where: { id: cupcake.id } });
    expect(stored.imagePath).toBe(second.path);
  });

  it('recusa confirmar uma imagem que não foi enviada', async () => {
    const upload = await asAdmin('post', '/image/upload-url').send({
      contentType: 'image/webp',
      sizeBytes: 100,
    });

    const response = await asAdmin('put', '/image').send({ path: upload.body.data.path });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('IMAGE_NOT_UPLOADED');
  });

  it('rejeita e apaga arquivos com tipo ou tamanho inválidos', async () => {
    const upload = await uploadImage({ size: 9 * 1024 * 1024, mimetype: 'image/webp' });

    const response = await asAdmin('put', '/image').send({ path: upload.path });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_IMAGE');
    expect(fakeStorage.has(BUCKET, upload.path)).toBe(false);
  });

  it('impede vincular caminhos de outro cupcake ou fora do padrão', async () => {
    const other = await createCupcake();
    const foreignPath = `cupcakes/${other.id}/${crypto.randomUUID()}.webp`;
    fakeStorage.put(BUCKET, foreignPath);

    for (const path of [
      foreignPath,
      `cupcakes/${cupcake.id}/../../segredo.webp`,
      'qualquer.webp',
    ]) {
      const response = await asAdmin('put', '/image').send({ path });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_IMAGE_PATH');
    }
  });

  it('remove a imagem do cupcake', async () => {
    const upload = await uploadImage();
    await asAdmin('put', '/image').send({ path: upload.path });

    const response = await asAdmin('delete', '/image');

    expect(response.status).toBe(200);
    expect(response.body.data.imageUrl).toBeNull();
    expect(fakeStorage.removed()).toEqual([upload.path]);
  });

  it('bloqueia uploads de quem não é administrador', async () => {
    const baker = await createUser({ role: 'BAKER' });
    const response = await request(app)
      .post(`/api/v1/admin/cupcakes/${cupcake.id}/image/upload-url`)
      .set('Authorization', baker.authHeader)
      .send({ contentType: 'image/webp', sizeBytes: 100 });

    expect(response.status).toBe(403);
  });

  it('retorna 404 para cupcake inexistente', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/cupcakes/${crypto.randomUUID()}/image/upload-url`)
      .set('Authorization', admin.authHeader)
      .send({ contentType: 'image/webp', sizeBytes: 100 });

    expect(response.status).toBe(404);
  });
});

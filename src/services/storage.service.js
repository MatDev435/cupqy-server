import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { IMAGE_TYPES, SIGNED_UPLOAD_URL_TTL_SECONDS } from '../config/images.js';
import { AppError } from '../utils/AppError.js';

const bucket = () => supabaseAdmin.storage.from(config.supabase.storageBucket);

function storageError() {
  return AppError.badGateway(
    'Não foi possível acessar o armazenamento de imagens. Tente novamente.',
    'STORAGE_ERROR',
  );
}

/** URL pública de um objeto do bucket de imagens (bucket público para leitura). */
export function getPublicUrl(path) {
  if (!path) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${config.supabase.url}/storage/v1/object/public/${config.supabase.storageBucket}/${encodedPath}`;
}

/** Prefixo exclusivo das imagens de um cupcake no bucket. */
export function cupcakeImagePrefix(cupcakeId) {
  return `cupcakes/${cupcakeId}/`;
}

/**
 * Gera uma URL assinada para o front-end enviar a imagem DIRETAMENTE ao Supabase Storage.
 * O caminho é sempre definido pelo servidor (nunca pelo cliente).
 */
export async function createCupcakeImageUpload(cupcakeId, contentType) {
  const path = `${cupcakeImagePrefix(cupcakeId)}${randomUUID()}.${IMAGE_TYPES[contentType]}`;

  let result;
  try {
    result = await bucket().createSignedUploadUrl(path);
  } catch (error) {
    logger.error({ err: error }, 'Falha ao gerar URL assinada de upload');
    throw storageError();
  }
  if (result.error) {
    logger.error({ err: result.error }, 'Falha ao gerar URL assinada de upload');
    throw storageError();
  }

  return {
    bucket: config.supabase.storageBucket,
    path: result.data.path,
    token: result.data.token,
    signedUrl: result.data.signedUrl,
    expiresInSeconds: SIGNED_UPLOAD_URL_TTL_SECONDS,
  };
}

function isNotFound(error) {
  return (
    error?.status === 404 ||
    error?.statusCode === '404' ||
    /not.?found|does not exist/i.test(error?.message ?? '')
  );
}

/**
 * Metadados de um objeto do bucket.
 * @returns {Promise<{ size: number, contentType: string } | null>} null se o arquivo não existe
 */
export async function getObjectInfo(path) {
  let result;
  try {
    result = await bucket().info(path);
  } catch (error) {
    logger.error({ err: error, path }, 'Falha ao consultar objeto no Storage');
    throw storageError();
  }
  if (result.error) {
    if (isNotFound(result.error)) return null;
    logger.error({ err: result.error, path }, 'Falha ao consultar objeto no Storage');
    throw storageError();
  }
  return { size: result.data.size ?? 0, contentType: result.data.contentType ?? '' };
}

/**
 * Remove objetos do bucket. Falhas são registradas mas não interrompem o fluxo
 * (um arquivo órfão não deve impedir a operação principal).
 */
export async function removeObjects(paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return;

  try {
    const { error } = await bucket().remove(validPaths);
    if (error)
      logger.warn({ err: error, paths: validPaths }, 'Falha ao remover imagens do Storage');
  } catch (error) {
    logger.warn({ err: error, paths: validPaths }, 'Falha ao remover imagens do Storage');
  }
}

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';

/** URL pública de um objeto do bucket de imagens (bucket público para leitura). */
export function getPublicUrl(path) {
  if (!path) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${config.supabase.url}/storage/v1/object/public/${config.supabase.storageBucket}/${encodedPath}`;
}

/**
 * Remove objetos do bucket. Falhas são registradas mas não interrompem o fluxo
 * (um arquivo órfão não deve impedir a operação principal).
 */
export async function removeObjects(paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return;

  try {
    const { error } = await supabaseAdmin.storage
      .from(config.supabase.storageBucket)
      .remove(validPaths);
    if (error)
      logger.warn({ err: error, paths: validPaths }, 'Falha ao remover imagens do Storage');
  } catch (error) {
    logger.warn({ err: error, paths: validPaths }, 'Falha ao remover imagens do Storage');
  }
}

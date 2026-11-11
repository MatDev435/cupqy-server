import { config } from '../config/env.js';

/** URL pública de um objeto do bucket de imagens (bucket público para leitura). */
export function getPublicUrl(path) {
  if (!path) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${config.supabase.url}/storage/v1/object/public/${config.supabase.storageBucket}/${encodedPath}`;
}

/**
 * Restrições das fotos dos cupcakes. Aplicadas pela API e também configuradas no próprio
 * bucket do Supabase Storage (scripts/setup-storage.js) como defesa em profundidade.
 */
export const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Tipos aceitos → extensão do arquivo gerado. */
export const IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

/** Validade da URL assinada de upload do Supabase Storage (fixa em 2 horas). */
export const SIGNED_UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;

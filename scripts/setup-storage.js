/**
 * Cria (ou atualiza) o bucket das fotos dos cupcakes no Supabase Storage.
 *
 * - Público para LEITURA (as imagens aparecem no catálogo sem autenticação).
 * - ESCRITA somente pela API: não há políticas de INSERT/UPDATE/DELETE para anon/authenticated;
 *   uploads acontecem apenas com URLs assinadas geradas pela API para administradores.
 * - Tipos e tamanho máximo também restringidos no próprio bucket (defesa em profundidade).
 *
 * Uso: npm run storage:setup
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { IMAGE_MAX_SIZE_BYTES, IMAGE_TYPES } from '../src/config/images.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'cupcake-images';

if (!url || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar o script.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const options = {
  public: true,
  fileSizeLimit: IMAGE_MAX_SIZE_BYTES,
  allowedMimeTypes: Object.keys(IMAGE_TYPES),
};

const { data: existing } = await supabase.storage.getBucket(bucket);
const { error } = existing
  ? await supabase.storage.updateBucket(bucket, options)
  : await supabase.storage.createBucket(bucket, options);

if (error) {
  console.error(`Falha ao configurar o bucket "${bucket}":`, error.message);
  process.exit(1);
}

console.log(
  `Bucket "${bucket}" ${existing ? 'atualizado' : 'criado'}: público para leitura, ` +
    `até ${IMAGE_MAX_SIZE_BYTES / 1024 / 1024} MB, tipos ${options.allowedMimeTypes.join(', ')}.`,
);

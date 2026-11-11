import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

const serverAuthOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/**
 * Cliente administrativo (chave service_role) — USO EXCLUSIVO DO SERVIDOR.
 * Valida tokens, administra usuários do Auth e gera URLs assinadas do Storage.
 * A chave service_role nunca deve ser enviada ao front-end.
 */
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  serverAuthOptions,
);

/**
 * Cria um cliente efêmero com a chave pública (anon), sem persistir sessão.
 * Usado para reconfirmar a senha do usuário em operações críticas (ex.: exclusão de conta).
 */
export function createSupabasePublicClient() {
  return createClient(config.supabase.url, config.supabase.anonKey, serverAuthOptions);
}

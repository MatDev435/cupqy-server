-- =============================================================================
-- Cupqy — Segurança específica do Supabase
--
-- Executar APÓS `npm run db:deploy` (migrations do Prisma), pelo SQL Editor do Supabase
-- ou com `npm run db:supabase`. O script é idempotente (pode ser reexecutado).
--
-- Contexto: a API (Express + Prisma) conecta como dona das tabelas e ignora o RLS.
-- Já o front-end usa as chaves anon/authenticated do Supabase, que dão acesso à API REST
-- (PostgREST) e ao Realtime. Este script define exatamente o que esses papéis podem LER.
-- =============================================================================

-- 1. Tabela interna do Prisma não deve ser exposta pela API REST do Supabase.
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;

-- 2. Defesa em profundidade: anon/authenticated nunca escrevem diretamente nas tabelas.
--    Toda escrita passa pela API, que aplica validação e regras de negócio.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- 3. Funções auxiliares (SECURITY DEFINER para consultar profiles apesar do RLS).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public."UserRole"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.current_user_role() IN ('BAKER', 'ADMIN'), false)
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- 4. Políticas de LEITURA (usadas principalmente pelo Supabase Realtime).

-- Perfil: cada usuário lê apenas o próprio perfil.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- Pedidos: cliente lê os próprios; confeiteiros e administradores leem todos (painel da cozinha).
DROP POLICY IF EXISTS "orders_select_own_or_staff" ON public.orders;
CREATE POLICY "orders_select_own_or_staff" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_staff()));

DROP POLICY IF EXISTS "order_items_select_own_or_staff" ON public.order_items;
CREATE POLICY "order_items_select_own_or_staff" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_staff())
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "order_status_history_select_own_or_staff" ON public.order_status_history;
CREATE POLICY "order_status_history_select_own_or_staff" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_staff())
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id AND o.user_id = (SELECT auth.uid())
    )
  );

-- Estoque do dia: leitura pública (disponibilidade em tempo real no catálogo).
DROP POLICY IF EXISTS "daily_stock_select_public" ON public.daily_stock;
CREATE POLICY "daily_stock_select_public" ON public.daily_stock
  FOR SELECT TO anon, authenticated
  USING (true);

-- Demais tabelas (addresses, payments, cupcakes, categories...) continuam sem políticas:
-- acesso direto negado; os dados são servidos apenas pela API.

-- 5. Sincronização com o Supabase Auth.

-- 5.1 Cria o perfil (sempre como CUSTOMER) quando um usuário se cadastra.
--     O papel NUNCA vem dos metadados enviados pelo front-end.
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    LEFT(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), 120),
    LEFT(NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), ''), 20),
    'CUSTOMER',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();

-- 5.2 Rede de segurança LGPD: se um usuário for removido diretamente no painel do Supabase,
--     os dados pessoais são anonimizados (o histórico financeiro é preservado).
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
     SET email = NULL,
         full_name = NULL,
         phone = NULL,
         deleted_at = COALESCE(deleted_at, now()),
         updated_at = now()
   WHERE id = OLD.id;

  DELETE FROM public.addresses WHERE user_id = OLD.id;

  UPDATE public.orders
     SET notes = NULL,
         delivery_address = CASE
           WHEN delivery_address IS NULL THEN NULL
           ELSE jsonb_build_object(
             'city', delivery_address ->> 'city',
             'state', delivery_address ->> 'state'
           )
         END,
         updated_at = now()
   WHERE user_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

REVOKE ALL ON FUNCTION public.handle_auth_user_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC, anon, authenticated;

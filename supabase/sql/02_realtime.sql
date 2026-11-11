-- =============================================================================
-- Cupqy — Supabase Realtime
--
-- Publica alterações das tabelas abaixo para o front-end (via supabase-js):
--   - orders / order_status_history: acompanhamento do pedido pelo cliente e painel da cozinha
--   - daily_stock: "Esgotado" em tempo real no catálogo
--
-- As políticas RLS de 01_security.sql garantem que cada usuário receba apenas o que pode ler.
-- Idempotente.
-- =============================================================================

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['orders', 'order_status_history', 'daily_stock'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

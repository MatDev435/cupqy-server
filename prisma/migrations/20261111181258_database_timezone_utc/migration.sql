-- Fuso horário padrão do banco em UTC.
--
-- O Prisma (driver adapter "pg") envia valores DateTime como timestamp sem fuso. O PostgreSQL
-- os interpreta no TimeZone da sessão; se ele não for UTC, os instantes são gravados deslocados
-- (ex.: 3 horas em America/Sao_Paulo), quebrando consultas SQL e comparações com now().
-- O Supabase já usa UTC por padrão; esta configuração garante o mesmo em qualquer PostgreSQL.
-- (Datas locais da loja são calculadas pela aplicação com STORE_TIMEZONE.)
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;

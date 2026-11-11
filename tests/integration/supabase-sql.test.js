import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { migrate } from './globalSetup.js';

/**
 * Valida os scripts de supabase/sql/ em um PostgreSQL real, simulando os objetos que o
 * Supabase provê (schema auth, auth.uid(), papéis anon/authenticated e a publicação do Realtime).
 * Usa um banco separado para não interferir nos demais testes.
 */

const DATABASE = 'cupqy_supabase_sql_test';
const SQL_FILES = ['supabase/sql/01_security.sql', 'supabase/sql/02_realtime.sql'];

const SUPABASE_STUBS = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

  CREATE PUBLICATION supabase_realtime;
`;

// Privilégios padrão concedidos pelo Supabase aos papéis da API REST.
const SUPABASE_DEFAULT_GRANTS = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
`;

const ids = {
  customerA: '11111111-1111-4111-8111-111111111111',
  customerB: '22222222-2222-4222-8222-222222222222',
  baker: '33333333-3333-4333-8333-333333333333',
};

let maintenance;
let db;

function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Executa consultas como um papel do Supabase, dentro de uma transação descartada. */
async function asRole(role, userId, fn) {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    if (userId) {
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ]);
    }
    return await fn();
  } finally {
    await db.query('ROLLBACK');
  }
}

async function count(sql) {
  const { rows } = await db.query(sql);
  return Number(rows[0].count);
}

describe('Scripts SQL do Supabase (RLS, triggers e Realtime)', () => {
  beforeAll(async () => {
    maintenance = new pg.Client({ connectionString: inject('maintenanceDatabaseUrl') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await maintenance.query(`CREATE DATABASE ${DATABASE}`);

    const url = withDatabase(inject('databaseUrl'), DATABASE);
    db = new pg.Client({ connectionString: url });
    await db.connect();

    await db.query(SUPABASE_STUBS);
    migrate(url);
    await db.query(SUPABASE_DEFAULT_GRANTS);

    // Executa duas vezes para garantir idempotência.
    for (let run = 0; run < 2; run += 1) {
      for (const file of SQL_FILES) {
        await db.query(readFileSync(file, 'utf8'));
      }
    }

    // Cadastro via Supabase Auth dispara a criação dos perfis.
    await db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ($1, 'a@cupqy.test', '{"full_name": "Cliente A", "phone": "(11) 98888-7777", "role": "ADMIN"}'),
        ($2, 'b@cupqy.test', '{"full_name": "Cliente B"}'),
        ($3, 'confeiteiro@cupqy.test', '{}')`,
      [ids.customerA, ids.customerB, ids.baker],
    );
    await db.query(`UPDATE profiles SET role = 'BAKER' WHERE id = $1`, [ids.baker]);

    for (const userId of [ids.customerA, ids.customerB]) {
      await db.query(
        `INSERT INTO orders (id, user_id, fulfillment_type, subtotal_cents, total_cents, notes, delivery_address, delivery_fee_cents, updated_at)
         VALUES (gen_random_uuid(), $1, 'DELIVERY', 1000, 1500, 'Tocar o interfone',
                 '{"street": "Rua A", "number": "10", "city": "São Paulo", "state": "SP"}', 500, now())`,
        [userId],
      );
    }
    await db.query(
      `INSERT INTO addresses (user_id, zip_code, street, number, neighborhood, city, state, updated_at)
       VALUES ($1, '01310100', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', now())`,
      [ids.customerA],
    );
    await db.query(
      `INSERT INTO cupcakes (id, name, description, flavor, ingredients, price_cents, updated_at)
       VALUES ('44444444-4444-4444-8444-444444444444', 'Chocolate', 'x', 'Chocolate', 'x', 990, now())`,
    );
    await db.query(
      `INSERT INTO daily_stock (cupcake_id, date, quantity, updated_at)
       VALUES ('44444444-4444-4444-8444-444444444444', CURRENT_DATE, 10, now())`,
    );
  });

  afterAll(async () => {
    await db?.end();
    await maintenance?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await maintenance?.end();
  });

  it('cria o perfil no cadastro sempre como CUSTOMER, ignorando papel enviado nos metadados', async () => {
    const { rows } = await db.query('SELECT full_name, phone, role FROM profiles WHERE id = $1', [
      ids.customerA,
    ]);
    expect(rows[0]).toEqual({ full_name: 'Cliente A', phone: '11988887777', role: 'CUSTOMER' });
  });

  it('cliente lê apenas os próprios pedidos', async () => {
    const total = await asRole('authenticated', ids.customerA, () =>
      count('SELECT count(*) FROM orders'),
    );
    expect(total).toBe(1);
  });

  it('confeiteiro lê todos os pedidos (painel da cozinha)', async () => {
    const total = await asRole('authenticated', ids.baker, () =>
      count('SELECT count(*) FROM orders'),
    );
    expect(total).toBe(2);
  });

  it('visitante (anon) não lê pedidos, mas lê o estoque do dia', async () => {
    const orders = await asRole('anon', null, () => count('SELECT count(*) FROM orders'));
    const stock = await asRole('anon', null, () => count('SELECT count(*) FROM daily_stock'));
    expect(orders).toBe(0);
    expect(stock).toBe(1);
  });

  it('usuário lê apenas o próprio perfil e nenhum endereço diretamente', async () => {
    const profiles = await asRole('authenticated', ids.customerA, () =>
      count('SELECT count(*) FROM profiles'),
    );
    const addresses = await asRole('authenticated', ids.customerA, () =>
      count('SELECT count(*) FROM addresses'),
    );
    expect(profiles).toBe(1);
    expect(addresses).toBe(0);
  });

  it('nega escrita direta pelos papéis do Supabase', async () => {
    await expect(
      asRole('authenticated', ids.customerA, () =>
        db.query(`UPDATE profiles SET role = 'ADMIN' WHERE id = '${ids.customerA}'`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('publica pedidos, histórico e estoque no Supabase Realtime', async () => {
    const { rows } = await db.query(
      `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1`,
    );
    expect(rows.map((row) => row.tablename)).toEqual([
      'daily_stock',
      'order_status_history',
      'orders',
    ]);
  });

  it('anonimiza dados pessoais quando o usuário é removido do Supabase Auth', async () => {
    await db.query('DELETE FROM auth.users WHERE id = $1', [ids.customerA]);

    const profile = await db.query(
      'SELECT email, full_name, phone, deleted_at FROM profiles WHERE id = $1',
      [ids.customerA],
    );
    const addresses = await count(
      `SELECT count(*) FROM addresses WHERE user_id = '${ids.customerA}'`,
    );
    const order = await db.query(
      'SELECT notes, delivery_address, total_cents FROM orders WHERE user_id = $1',
      [ids.customerA],
    );

    expect(profile.rows[0]).toMatchObject({ email: null, full_name: null, phone: null });
    expect(profile.rows[0].deleted_at).toBeInstanceOf(Date);
    expect(addresses).toBe(0);
    expect(order.rows[0]).toEqual({
      notes: null,
      delivery_address: { city: 'São Paulo', state: 'SP' },
      total_cents: 1500,
    });
  });
});

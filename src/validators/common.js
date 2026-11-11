import { z } from './zod.js';
import { onlyDigits } from '../utils/text.js';

export const uuid = () => z.uuid({ error: 'Identificador inválido.' });

/** Schema de params com um único identificador UUID (ex.: { id }). */
export const idParams = (name = 'id') => z.object({ [name]: uuid() });

/** Texto obrigatório: remove espaços extras e exige tamanho mínimo/máximo. */
export const requiredText = (max, min = 1) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(min).max(max));

/** Texto opcional: string vazia vira null. */
export const optionalText = (max) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' ') || null)
    .pipe(z.string().max(max).nullable())
    .nullish();

/** Telefone brasileiro com DDD (10 ou 11 dígitos), aceitando máscara. */
export const phone = () =>
  z
    .string()
    .transform((value) => onlyDigits(value) ?? '')
    .pipe(z.string().regex(/^\d{10,11}$/, 'Telefone deve conter DDD + número (10 ou 11 dígitos).'));

/** CEP com ou sem máscara (00000-000), normalizado para 8 dígitos. */
export const zipCode = () =>
  z
    .string()
    .transform((value) => onlyDigits(value) ?? '')
    .pipe(z.string().regex(/^\d{8}$/, 'CEP deve conter 8 dígitos.'));

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

export const state = () =>
  z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.enum(BRAZILIAN_STATES, { error: 'UF inválida.' }));

/** Booleano vindo de query string ("true"/"false"). */
export const booleanQuery = () =>
  z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');

/** Paginação padrão: 20 itens por página (US12 — RNF#01), máximo 50. */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};

/** Exige ao menos um campo informado em atualizações parciais. */
export const atLeastOneField = (schema) =>
  schema.refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });

/**
 * Lista em query string, aceitando "a,b" ou parâmetros repetidos (?x=a&x=b).
 * @param {import('zod').ZodType} item Schema de cada item
 */
export const csvList = (item, max = 10) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(','))
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(max))
    .optional();

export const slug = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Identificador (slug) inválido.')
    .max(70);

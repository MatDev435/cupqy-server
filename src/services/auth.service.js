import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { Roles } from '../config/permissions.js';
import * as profileModel from '../models/profile.model.js';
import { AppError } from '../utils/AppError.js';
import { cleanText, onlyDigits } from '../utils/text.js';

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 8192;

/** Extrai o token do cabeçalho "Authorization: Bearer <token>". */
export function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Valida o Access Token (JWT) emitido pelo Supabase Auth consultando o próprio Supabase.
 * Isso também garante que sessões encerradas (logout) não sejam mais aceitas.
 */
export async function verifyAccessToken(token) {
  if (token.length > MAX_TOKEN_LENGTH || !JWT_PATTERN.test(token)) {
    throw AppError.unauthorized('Token de acesso inválido.', 'INVALID_TOKEN');
  }

  let result;
  try {
    result = await supabaseAdmin.auth.getUser(token);
  } catch (error) {
    logger.error({ err: error }, 'Falha ao contatar o Supabase Auth');
    throw AppError.serviceUnavailable(
      'Serviço de autenticação indisponível. Tente novamente.',
      'AUTH_UNAVAILABLE',
    );
  }

  const { data, error } = result;
  if (error) {
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      logger.error({ err: error }, 'Supabase Auth indisponível');
      throw AppError.serviceUnavailable(
        'Serviço de autenticação indisponível. Tente novamente.',
        'AUTH_UNAVAILABLE',
      );
    }
    throw AppError.unauthorized(
      'Sessão inválida ou expirada. Faça login novamente.',
      'INVALID_TOKEN',
    );
  }

  if (!data?.user?.id) {
    throw AppError.unauthorized(
      'Sessão inválida ou expirada. Faça login novamente.',
      'INVALID_TOKEN',
    );
  }

  return data.user;
}

function isUniqueViolation(error) {
  return error?.code === 'P2002';
}

/**
 * Garante que o usuário autenticado possua um perfil local.
 * O perfil normalmente é criado pelo trigger do Supabase (supabase/sql/01_security.sql);
 * aqui ele é criado sob demanda caso ainda não exista. O papel inicial é sempre CUSTOMER.
 */
export async function ensureProfile(authUser) {
  const existing = await profileModel.findById(authUser.id);

  if (existing) {
    if (!existing.deletedAt && authUser.email && existing.email !== authUser.email) {
      return profileModel.update(existing.id, { email: authUser.email });
    }
    return existing;
  }

  const metadata = authUser.user_metadata ?? {};
  try {
    return await profileModel.create({
      id: authUser.id,
      email: authUser.email ?? null,
      fullName: cleanText(metadata.full_name ?? metadata.name, 120),
      phone: onlyDigits(metadata.phone)?.slice(0, 20) ?? null,
      role: Roles.CUSTOMER,
    });
  } catch (error) {
    // Duas requisições simultâneas do mesmo usuário recém-cadastrado.
    if (isUniqueViolation(error)) return profileModel.findById(authUser.id);
    throw error;
  }
}

/**
 * Resolve o contexto de autenticação usado nas rotas protegidas.
 * @returns {Promise<{ id: string, email: string | null, role: string, profile: object }>}
 */
export async function authenticateRequest(token) {
  const authUser = await verifyAccessToken(token);
  const profile = await ensureProfile(authUser);

  if (profile.deletedAt) {
    throw AppError.forbidden('Esta conta foi encerrada.', 'ACCOUNT_DELETED');
  }

  return {
    id: profile.id,
    email: authUser.email ?? profile.email,
    role: profile.role,
    profile,
  };
}

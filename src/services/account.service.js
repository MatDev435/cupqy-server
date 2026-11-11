import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { createSupabasePublicClient, supabaseAdmin } from '../config/supabase.js';
import * as addressModel from '../models/address.model.js';
import * as orderModel from '../models/order.model.js';
import * as profileModel from '../models/profile.model.js';
import { AppError } from '../utils/AppError.js';

function authUnavailable() {
  return AppError.serviceUnavailable(
    'Serviço de autenticação indisponível. Tente novamente.',
    'AUTH_UNAVAILABLE',
  );
}

/** Reconfirma a senha atual do usuário diretamente no Supabase Auth. */
export async function verifyPassword(email, password) {
  if (!email) {
    throw AppError.unprocessable('Não foi possível confirmar sua identidade.', 'INVALID_PASSWORD');
  }

  const client = createSupabasePublicClient();
  let result;
  try {
    result = await client.auth.signInWithPassword({ email, password });
  } catch (error) {
    logger.error({ err: error }, 'Falha ao reconfirmar senha no Supabase Auth');
    throw authUnavailable();
  }

  const { error } = result;
  if (!error) return;
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) throw authUnavailable();

  throw AppError.unprocessable(
    'Senha incorreta. Não foi possível prosseguir com a exclusão.',
    'INVALID_PASSWORD',
  );
}

/** Remove dados pessoais mantendo o histórico financeiro anonimizado (US04 — RN#02). */
export async function anonymizeUserData(userId) {
  await prisma.$transaction(async (tx) => {
    await addressModel.deleteAllByUser(userId, tx);
    await orderModel.anonymizeByUser(userId, tx);
    await profileModel.update(
      userId,
      { email: null, fullName: null, phone: null, deletedAt: new Date() },
      tx,
    );
  });
}

/**
 * Exclusão de conta solicitada pelo próprio usuário (LGPD).
 *
 * 1. Reconfirma a senha (US04 — CA#02/CA#03).
 * 2. Bloqueia se houver pedidos em andamento (US04 — RN#01).
 * 3. Exclui o usuário no Supabase Auth — se falhar, nada foi alterado e o usuário pode tentar de novo.
 * 4. Anonimiza os dados locais (o trigger do Supabase faz o mesmo, como redundância).
 */
export async function deleteAccount(user, password) {
  await verifyPassword(user.email, password);

  const activeOrders = await orderModel.countActiveByUser(user.id);
  if (activeOrders > 0) {
    throw AppError.conflict(
      'Você possui pedidos em andamento. A conta só pode ser excluída após a conclusão ou o cancelamento deles.',
      'ACTIVE_ORDERS_PENDING',
      { activeOrders },
    );
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    logger.error({ err: error, userId: user.id }, 'Falha ao excluir usuário no Supabase Auth');
    throw AppError.badGateway(
      'Não foi possível excluir a conta agora. Tente novamente em instantes.',
      'ACCOUNT_DELETION_FAILED',
    );
  }

  try {
    await anonymizeUserData(user.id);
  } catch (anonymizationError) {
    // O usuário já não consegue mais acessar; registra para correção manual.
    logger.error(
      { err: anonymizationError, userId: user.id },
      'Usuário excluído do Auth, mas a anonimização local falhou',
    );
    throw anonymizationError;
  }

  logger.info({ userId: user.id }, 'Conta excluída e dados anonimizados');
}

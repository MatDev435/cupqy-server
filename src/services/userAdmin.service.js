import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { Roles } from '../config/permissions.js';
import * as profileModel from '../models/profile.model.js';
import { AppError } from '../utils/AppError.js';
import { buildPageMeta, toSkipTake } from '../utils/pagination.js';

function notFound() {
  return AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');
}

export async function listUsers({ search, role, includeDeleted, page, pageSize }) {
  const { items, total } = await profileModel.search(
    { search, role, includeDeleted },
    toSkipTake({ page, pageSize }),
  );
  return { items, meta: buildPageMeta({ page, pageSize }, total) };
}

export async function getUser(userId) {
  const profile = await profileModel.findById(userId);
  if (!profile) throw notFound();
  return profile;
}

/**
 * Altera o papel de um usuário.
 * Regras: o administrador não altera o próprio papel e o sistema nunca fica sem administrador
 * (as linhas dos admins são bloqueadas para evitar rebaixamentos simultâneos).
 */
export async function changeRole(actor, userId, role) {
  if (actor.id === userId) {
    throw AppError.unprocessable(
      'Você não pode alterar o seu próprio papel.',
      'CANNOT_CHANGE_OWN_ROLE',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const admins = await profileModel.lockActiveAdmins(tx);
    const target = await profileModel.findById(userId, tx);

    if (!target) throw notFound();
    if (target.deletedAt) {
      throw AppError.unprocessable('Não é possível alterar uma conta encerrada.', 'USER_DELETED');
    }
    if (target.role === role) return target;

    const isLastAdmin =
      target.role === Roles.ADMIN && admins.length <= 1 && admins.some((a) => a.id === userId);
    if (isLastAdmin) {
      throw AppError.unprocessable(
        'O sistema precisa de pelo menos um administrador.',
        'LAST_ADMIN',
      );
    }

    return profileModel.update(userId, { role }, tx);
  });

  logger.info({ actorId: actor.id, userId, role }, 'Papel de usuário alterado');
  return updated;
}

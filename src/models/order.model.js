import { prisma } from '../config/prisma.js';

export const FINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

/** Pedidos em andamento (qualquer status diferente de Concluído ou Cancelado). */
export function countActiveByUser(userId, db = prisma) {
  return db.order.count({ where: { userId, status: { notIn: FINAL_STATUSES } } });
}

/**
 * Remove dados pessoais dos pedidos de um usuário, preservando os valores financeiros
 * (histórico de vendas para auditoria fiscal). Do endereço restam apenas cidade e UF.
 */
export function anonymizeByUser(userId, db = prisma) {
  return db.$executeRaw`
    UPDATE orders
       SET notes = NULL,
           delivery_address = CASE
             WHEN delivery_address IS NULL THEN NULL
             ELSE jsonb_build_object(
               'city', delivery_address ->> 'city',
               'state', delivery_address ->> 'state'
             )
           END,
           updated_at = now()
     WHERE user_id = ${userId}::uuid`;
}

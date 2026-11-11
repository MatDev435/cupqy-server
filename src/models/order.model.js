import { prisma } from '../config/prisma.js';

export const FINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

export const orderDetailsInclude = {
  items: { orderBy: { cupcakeName: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
};

export function create(data, db = prisma) {
  return db.order.create({ data, include: orderDetailsInclude });
}

export function findById(id, db = prisma) {
  return db.order.findUnique({ where: { id }, include: orderDetailsInclude });
}

/** Pedidos em andamento (qualquer status diferente de Concluído ou Cancelado). */
export function countActiveByUser(userId, db = prisma) {
  return db.order.count({ where: { userId, status: { notIn: FINAL_STATUSES } } });
}

export function countAwaitingPaymentByUser(userId, db = prisma) {
  return db.order.count({ where: { userId, status: 'AWAITING_PAYMENT' } });
}

export async function listByUser(userId, { statuses, skip, take }, db = prisma) {
  const where = { userId, ...(statuses && { status: { in: statuses } }) };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      include: { items: { orderBy: { cupcakeName: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    db.order.count({ where }),
  ]);
  return { items, total };
}

/**
 * Atualiza o pedido apenas se o status atual ainda for um dos esperados (controle otimista
 * de concorrência). Retorna true se a atualização ocorreu.
 */
export async function updateIfStatus(id, expectedStatuses, data, db = prisma) {
  const { count } = await db.order.updateMany({
    where: { id, status: { in: expectedStatuses } },
    data,
  });
  return count === 1;
}

export function addStatusHistory(entry, db = prisma) {
  return db.orderStatusHistory.create({ data: entry });
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

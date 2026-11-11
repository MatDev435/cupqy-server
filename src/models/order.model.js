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

export function setPreference(id, mpPreferenceId, db = prisma) {
  return db.order.update({ where: { id }, data: { mpPreferenceId } });
}

/** Bloqueia a linha do pedido até o fim da transação (serializa webhooks concorrentes). */
export async function lockById(id, db) {
  const rows = await db.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}

export function update(id, data, db = prisma) {
  return db.order.update({ where: { id }, data });
}

/** Pedidos aguardando pagamento cujo prazo terminou antes do instante informado. */
export function findExpiredAwaitingPayment(before, limit, db = prisma) {
  return db.order.findMany({
    where: { status: 'AWAITING_PAYMENT', paymentExpiresAt: { lt: before } },
    orderBy: { paymentExpiresAt: 'asc' },
    select: { id: true, orderNumber: true },
    take: limit,
  });
}

/** Pedidos da cozinha: pagos e em andamento, do pagamento mais antigo ao mais recente. */
export function findForKitchen({ statuses, fulfillmentType }, db = prisma) {
  return db.order.findMany({
    where: { status: { in: statuses }, ...(fulfillmentType && { fulfillmentType }) },
    include: {
      items: { orderBy: { cupcakeName: 'asc' } },
      user: { select: { fullName: true, phone: true } },
    },
    orderBy: [{ paidAt: 'asc' }, { orderNumber: 'asc' }],
  });
}

export function findByIdForKitchen(id, db = prisma) {
  return db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { cupcakeName: 'asc' } },
      user: { select: { fullName: true, phone: true } },
    },
  });
}

/** Listagem administrativa com filtros (status, tipo de entrega, período e número do pedido). */
export async function searchAll(
  { statuses, fulfillmentType, from, to, orderNumber, skip, take },
  db = prisma,
) {
  const where = {
    ...(statuses && { status: { in: statuses } }),
    ...(fulfillmentType && { fulfillmentType }),
    ...(orderNumber && { orderNumber }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        items: { orderBy: { cupcakeName: 'asc' } },
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    db.order.count({ where }),
  ]);
  return { items, total };
}

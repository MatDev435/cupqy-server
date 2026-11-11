import { prisma } from '../config/prisma.js';

export function findByProviderId(provider, providerPaymentId, db = prisma) {
  return db.payment.findUnique({
    where: { provider_providerPaymentId: { provider, providerPaymentId } },
  });
}

export function upsert(data, db = prisma) {
  const { provider, providerPaymentId, orderId, ...fields } = data;
  return db.payment.upsert({
    where: { provider_providerPaymentId: { provider, providerPaymentId } },
    create: { provider, providerPaymentId, orderId, ...fields },
    update: fields,
  });
}

export function update(id, data, db = prisma) {
  return db.payment.update({ where: { id }, data });
}

export function findApprovedByOrder(orderId, db = prisma) {
  return db.payment.findMany({ where: { orderId, status: 'APPROVED' } });
}

import { prisma } from '../config/prisma.js';

export function listByUser(userId, db = prisma) {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export function findByIdForUser(id, userId, db = prisma) {
  return db.address.findFirst({ where: { id, userId } });
}

export function countByUser(userId, db = prisma) {
  return db.address.count({ where: { userId } });
}

export function findMostRecent(userId, db = prisma) {
  return db.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export function create(data, db = prisma) {
  return db.address.create({ data });
}

export function update(id, data, db = prisma) {
  return db.address.update({ where: { id }, data });
}

export function remove(id, db = prisma) {
  return db.address.delete({ where: { id } });
}

export function clearDefault(userId, db = prisma) {
  return db.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
}

export function deleteAllByUser(userId, db = prisma) {
  return db.address.deleteMany({ where: { userId } });
}

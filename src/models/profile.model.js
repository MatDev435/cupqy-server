import { prisma } from '../config/prisma.js';

export function findById(id, db = prisma) {
  return db.profile.findUnique({ where: { id } });
}

export function create(data, db = prisma) {
  return db.profile.create({ data });
}

export function update(id, data, db = prisma) {
  return db.profile.update({ where: { id }, data });
}

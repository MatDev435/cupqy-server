import { prisma } from '../config/prisma.js';

export function listAll(db = prisma) {
  return db.dietaryTag.findMany({ orderBy: { name: 'asc' } });
}

export function findById(id, db = prisma) {
  return db.dietaryTag.findUnique({ where: { id } });
}

export function findManyByIds(ids, db = prisma) {
  return db.dietaryTag.findMany({ where: { id: { in: ids } } });
}

export function create(data, db = prisma) {
  return db.dietaryTag.create({ data });
}

export function update(id, data, db = prisma) {
  return db.dietaryTag.update({ where: { id }, data });
}

export function remove(id, db = prisma) {
  return db.dietaryTag.delete({ where: { id } });
}

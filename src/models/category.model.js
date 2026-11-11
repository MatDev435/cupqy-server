import { prisma } from '../config/prisma.js';

export function listAll(db = prisma) {
  return db.category.findMany({ orderBy: { name: 'asc' } });
}

export function findById(id, db = prisma) {
  return db.category.findUnique({ where: { id } });
}

export function create(data, db = prisma) {
  return db.category.create({ data });
}

export function update(id, data, db = prisma) {
  return db.category.update({ where: { id }, data });
}

export function remove(id, db = prisma) {
  return db.category.delete({ where: { id } });
}

export function countCupcakes(id, db = prisma) {
  return db.cupcake.count({ where: { categoryId: id, deletedAt: null } });
}

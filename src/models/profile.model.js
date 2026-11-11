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

function buildSearchWhere({ search, role, includeDeleted }) {
  const where = {};
  if (!includeDeleted) where.deletedAt = null;
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function search(filters, { skip, take }, db = prisma) {
  const where = buildSearchWhere(filters);
  const [items, total] = await Promise.all([
    db.profile.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    db.profile.count({ where }),
  ]);
  return { items, total };
}

/** Bloqueia as linhas dos administradores ativos até o fim da transação. */
export async function lockActiveAdmins(db) {
  return db.$queryRaw`
    SELECT id FROM profiles
     WHERE role = 'ADMIN' AND deleted_at IS NULL
     ORDER BY id
     FOR UPDATE`;
}

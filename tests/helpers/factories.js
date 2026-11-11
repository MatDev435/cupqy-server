import { prisma } from '../../src/config/prisma.js';
import { storeToday } from '../../src/services/storeCalendar.service.js';
import { dateOnlyToDate } from '../../src/utils/dates.js';
import { slugify } from '../../src/utils/text.js';

let sequence = 0;
const next = () => (sequence += 1);

export function today() {
  return storeToday().dateOnly;
}

export async function createCategory(name = `Categoria ${next()}`) {
  return prisma.category.create({ data: { name, slug: slugify(name) } });
}

export async function createDietaryTag(name = `Restrição ${next()}`) {
  return prisma.dietaryTag.create({ data: { name, slug: slugify(name) } });
}

/** Define o estoque de um cupcake em uma data (padrão: hoje no fuso da loja). */
export async function setStock(cupcakeId, quantity, dateOnly = today()) {
  const date = dateOnlyToDate(dateOnly);
  return prisma.dailyStock.upsert({
    where: { cupcakeId_date: { cupcakeId, date } },
    update: { quantity },
    create: { cupcakeId, date, quantity },
  });
}

/**
 * Cria um cupcake. Por padrão com 10 unidades em estoque hoje (stock: null não cria estoque).
 * @param {object} [overrides]
 */
export async function createCupcake({ stock = 10, tags = [], category, ...overrides } = {}) {
  const cupcake = await prisma.cupcake.create({
    data: {
      name: `Cupcake ${next()}`,
      description: 'Massa fofinha com cobertura cremosa.',
      flavor: 'Chocolate',
      ingredients: 'Farinha, ovos, açúcar, cacau.',
      weightGrams: 80,
      size: 'Médio (7 cm)',
      priceCents: 990,
      categoryId: category?.id,
      dietaryTags: { create: tags.map((tag) => ({ dietaryTagId: tag.id })) },
      ...overrides,
    },
  });
  if (stock !== null) await setStock(cupcake.id, stock);
  return cupcake;
}

/**
 * Cria diretamente no banco um pedido já pago (útil para cozinha, dashboard e admin).
 * @param {{ userId: string, items: Array<{ cupcake: object, quantity: number }>, status?: string,
 *   fulfillmentType?: 'PICKUP' | 'DELIVERY', paidAt?: Date, completedAt?: Date, notes?: string }} options
 */
export async function createPaidOrder({
  userId,
  items,
  status = 'IN_PREPARATION',
  fulfillmentType = 'PICKUP',
  paidAt = new Date(),
  completedAt = null,
  createdAt,
  notes = null,
  deliveryFeeCents = fulfillmentType === 'DELIVERY' ? 500 : 0,
}) {
  const lines = items.map(({ cupcake, quantity }) => ({
    cupcakeId: cupcake.id,
    cupcakeName: cupcake.name,
    unitPriceCents: cupcake.priceCents,
    quantity,
    subtotalCents: cupcake.priceCents * quantity,
  }));
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);

  return prisma.order.create({
    data: {
      userId,
      status,
      fulfillmentType,
      subtotalCents,
      deliveryFeeCents,
      totalCents: subtotalCents + deliveryFeeCents,
      notes,
      paidAt,
      completedAt,
      ...(createdAt && { createdAt }),
      stockDate: dateOnlyToDate(storeToday().dateOnly),
      deliveryAddress:
        fulfillmentType === 'DELIVERY'
          ? {
              zipCode: '01310100',
              street: 'Avenida Paulista',
              number: '1000',
              complement: null,
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
            }
          : undefined,
      items: { create: lines },
      statusHistory: {
        create: [
          { toStatus: 'AWAITING_PAYMENT', createdAt: new Date(paidAt.getTime() - 60_000) },
          { fromStatus: 'AWAITING_PAYMENT', toStatus: 'IN_PREPARATION', createdAt: paidAt },
        ],
      },
    },
  });
}

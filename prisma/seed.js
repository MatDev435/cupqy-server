/**
 * Popula o banco com categorias, restrições alimentares e cupcakes de exemplo.
 * Idempotente: pode ser executado várias vezes sem duplicar registros.
 *
 * Uso:
 *   npm run db:seed                      # catálogo
 *   npm run db:seed -- --with-stock      # catálogo + estoque de hoje (20 unidades cada)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { dateOnlyToDate, toLocalDateString } from '../src/utils/dates.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Defina DATABASE_URL antes de executar o seed.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const categories = [
  { name: 'Clássicos', slug: 'classicos', description: 'Os sabores tradicionais da casa.' },
  { name: 'Frutados', slug: 'frutados', description: 'Cupcakes com frutas frescas e caldas.' },
  { name: 'Especiais', slug: 'especiais', description: 'Receitas exclusivas e sazonais.' },
];

const dietaryTags = [
  { name: 'Sem Lactose', slug: 'sem-lactose' },
  { name: 'Sem Glúten', slug: 'sem-gluten' },
  { name: 'Vegano', slug: 'vegano' },
  { name: 'Sem Açúcar', slug: 'sem-acucar' },
];

const nutrition = (calories, carbs, proteins, fat, sugars, sodium) => ({
  servingSizeGrams: 80,
  calories,
  carbohydratesGrams: carbs,
  proteinsGrams: proteins,
  totalFatGrams: fat,
  sugarsGrams: sugars,
  sodiumMg: sodium,
});

const cupcakes = [
  {
    name: 'Chocolate Belga',
    description: 'Massa de cacau intensa com cobertura de ganache de chocolate belga.',
    flavor: 'Chocolate',
    ingredients:
      'Farinha de trigo, chocolate belga 54%, ovos, manteiga, açúcar, cacau em pó, creme de leite.',
    weightGrams: 80,
    size: 'Médio (7 cm)',
    priceCents: 990,
    category: 'classicos',
    tags: [],
    nutritionalInfo: nutrition(320, 38, 5, 17, 26, 140),
  },
  {
    name: 'Baunilha Clássica',
    description: 'Massa amanteigada de baunilha com buttercream suave.',
    flavor: 'Baunilha',
    ingredients: 'Farinha de trigo, manteiga, açúcar, ovos, leite, extrato de baunilha.',
    weightGrams: 75,
    size: 'Médio (7 cm)',
    priceCents: 850,
    category: 'classicos',
    tags: [],
    nutritionalInfo: nutrition(290, 36, 4, 15, 24, 120),
  },
  {
    name: 'Frutas Vermelhas',
    description: 'Massa de baunilha recheada com geleia artesanal de frutas vermelhas.',
    flavor: 'Frutas Vermelhas',
    ingredients:
      'Farinha de trigo, morango, framboesa, mirtilo, açúcar, ovos, manteiga, cream cheese.',
    weightGrams: 85,
    size: 'Médio (7 cm)',
    priceCents: 1090,
    category: 'frutados',
    tags: [],
    nutritionalInfo: nutrition(300, 40, 4, 14, 28, 110),
  },
  {
    name: 'Caramelo Salgado',
    description: 'Massa de açúcar mascavo com recheio e cobertura de caramelo com flor de sal.',
    flavor: 'Caramelo',
    ingredients: 'Farinha de trigo, açúcar mascavo, creme de leite, manteiga, ovos, flor de sal.',
    weightGrams: 85,
    size: 'Médio (7 cm)',
    priceCents: 1050,
    category: 'especiais',
    tags: [],
    nutritionalInfo: nutrition(340, 42, 4, 18, 30, 210),
  },
  {
    name: 'Limão Siciliano',
    description: 'Massa cítrica com curd de limão siciliano e merengue maçaricado.',
    flavor: 'Limão',
    ingredients: 'Farinha de trigo, limão siciliano, açúcar, ovos, óleo vegetal, leite vegetal.',
    weightGrams: 75,
    size: 'Médio (7 cm)',
    priceCents: 950,
    category: 'frutados',
    tags: ['sem-lactose'],
    nutritionalInfo: nutrition(260, 37, 3, 11, 25, 90),
  },
  {
    name: 'Chocolate Vegano',
    description: 'Massa fofinha de cacau sem ingredientes de origem animal, com ganache de coco.',
    flavor: 'Chocolate',
    ingredients:
      'Farinha de trigo, cacau, açúcar demerara, leite de coco, óleo de coco, vinagre de maçã.',
    weightGrams: 80,
    size: 'Médio (7 cm)',
    priceCents: 1190,
    category: 'especiais',
    tags: ['vegano', 'sem-lactose'],
    nutritionalInfo: nutrition(280, 35, 4, 14, 20, 100),
  },
  {
    name: 'Morango sem Glúten',
    description: 'Massa de farinha de arroz e amêndoas com cobertura de morango fresco.',
    flavor: 'Morango',
    ingredients: 'Farinha de arroz, farinha de amêndoas, morango, açúcar, ovos, manteiga.',
    weightGrams: 80,
    size: 'Médio (7 cm)',
    priceCents: 1150,
    category: 'frutados',
    tags: ['sem-gluten'],
    nutritionalInfo: nutrition(270, 33, 5, 13, 22, 95),
  },
  {
    name: 'Doce de Leite',
    description: 'Massa de baunilha recheada com doce de leite cremoso e canela.',
    flavor: 'Doce de Leite',
    ingredients: 'Farinha de trigo, doce de leite, açúcar, ovos, manteiga, leite, canela.',
    weightGrams: 85,
    size: 'Médio (7 cm)',
    priceCents: 990,
    category: 'classicos',
    tags: [],
    nutritionalInfo: nutrition(330, 44, 5, 15, 32, 130),
  },
];

async function main() {
  const withStock = process.argv.includes('--with-stock');

  const categoryIds = {};
  for (const category of categories) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: category,
    });
    categoryIds[category.slug] = record.id;
  }

  const tagIds = {};
  for (const tag of dietaryTags) {
    const record = await prisma.dietaryTag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: tag,
    });
    tagIds[tag.slug] = record.id;
  }

  const today = dateOnlyToDate(
    toLocalDateString(new Date(), process.env.STORE_TIMEZONE || 'America/Sao_Paulo'),
  );

  for (const { category, tags, ...data } of cupcakes) {
    const existing = await prisma.cupcake.findFirst({ where: { name: data.name } });
    const cupcake =
      existing ??
      (await prisma.cupcake.create({
        data: {
          ...data,
          categoryId: categoryIds[category],
          dietaryTags: { create: tags.map((slug) => ({ dietaryTagId: tagIds[slug] })) },
        },
      }));

    if (withStock) {
      await prisma.dailyStock.upsert({
        where: { cupcakeId_date: { cupcakeId: cupcake.id, date: today } },
        update: {},
        create: { cupcakeId: cupcake.id, date: today, quantity: 20 },
      });
    }
  }

  console.log(
    `Seed concluído: ${categories.length} categorias, ${dietaryTags.length} restrições, ` +
      `${cupcakes.length} cupcakes${withStock ? ' e estoque de hoje' : ''}.`,
  );
}

try {
  await main();
} catch (error) {
  console.error('Falha no seed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

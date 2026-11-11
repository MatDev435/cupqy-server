/**
 * Define o papel de um usuário existente (ex.: promover o primeiro administrador).
 *
 * Uso:
 *   npm run admin:promote -- dono@cupqy.com.br           # ADMIN
 *   npm run admin:promote -- confeiteiro@cupqy.com.br BAKER
 *
 * O usuário precisa ter se cadastrado no app (perfil criado no Supabase).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const ROLES = ['CUSTOMER', 'BAKER', 'ADMIN'];
const [email, role = 'ADMIN'] = process.argv.slice(2);

if (!email || !ROLES.includes(role)) {
  console.error('Uso: npm run admin:promote -- <email> [CUSTOMER|BAKER|ADMIN]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL antes de executar o script.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const profile = await prisma.profile.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
  });

  if (!profile) {
    console.error(
      `Nenhum perfil ativo com o e-mail ${email}. O usuário precisa se cadastrar e confirmar o e-mail primeiro.`,
    );
    process.exitCode = 1;
  } else {
    await prisma.profile.update({ where: { id: profile.id }, data: { role } });
    console.log(`Papel de ${email} definido como ${role}.`);
  }
} finally {
  await prisma.$disconnect();
}

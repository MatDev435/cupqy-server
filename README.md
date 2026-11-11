# Cupqy — API (cupqy-server)

API REST do **Cupqy**, e-commerce de uma loja de cupcakes: catálogo, carrinho, checkout com
delivery ou retirada, pagamentos via Mercado Pago, painel da cozinha e painel administrativo.

> Projeto em desenvolvimento incremental. O andamento de cada etapa está em
> [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tecnologias

| Camada         | Tecnologia                                   |
| -------------- | -------------------------------------------- |
| Execução       | Node.js (>= 22.12)                           |
| API            | Express 5                                    |
| Banco de dados | Supabase PostgreSQL + Prisma ORM             |
| Autenticação   | Supabase Auth                                |
| Imagens        | Supabase Storage                             |
| E-mails        | Resend (SMTP personalizado do Supabase Auth) |
| Pagamentos     | Mercado Pago Checkout Pro (sandbox)          |
| Hospedagem     | Render                                       |
| Testes         | Vitest + Supertest                           |

## Scripts

| Comando                 | Descrição                                                  |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Inicia a API em modo desenvolvimento (reinicia ao salvar). |
| `npm start`             | Inicia a API em modo produção.                             |
| `npm test`              | Executa todos os testes.                                   |
| `npm run test:unit`     | Executa apenas os testes unitários.                        |
| `npm run test:coverage` | Executa os testes com relatório de cobertura.              |
| `npm run lint`          | Verifica o código com ESLint.                              |
| `npm run format`        | Formata o código com Prettier.                             |

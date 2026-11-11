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
| Logs           | Pino (JSON estruturado)                      |
| Validação      | Zod                                          |

## Arquitetura

A API segue o padrão **MVC** com camada de serviços:

```
Requisição → routes → middlewares (auth, RBAC, validação) → controllers → services → models → PostgreSQL
                                                                              ↘ integrações (Supabase, Mercado Pago)
```

| Camada         | Responsabilidade                                                                     |
| -------------- | ------------------------------------------------------------------------------------ |
| `routes/`      | Declaram endpoints e encadeiam middlewares.                                          |
| `middlewares/` | Autenticação, autorização, validação, rate limiting, CORS, HTTPS e erros.            |
| `controllers/` | Traduzem HTTP ↔ serviços (sem regra de negócio).                                     |
| `services/`    | Regras de negócio e integrações externas.                                            |
| `models/`      | Acesso a dados com Prisma (aceitam transações).                                      |
| `views/`       | Serializam entidades para o formato JSON da API.                                     |
| `validators/`  | Schemas Zod dos dados de entrada.                                                    |
| `config/`      | Variáveis de ambiente validadas, logger e clientes (Prisma, Supabase, Mercado Pago). |

### Padrão de respostas

- Sucesso: `{ "data": ... }` (listas paginadas incluem `meta`).
- Erro: `{ "error": { "code", "message", "details?" }, "requestId" }`.
  - `code` é estável (em inglês) para o front-end tratar; `message` é exibível ao usuário.
  - Todo response inclui o cabeçalho `X-Request-Id` para correlacionar com os logs.

## Estrutura de diretórios

```
.
├── docs/                 # Roadmap e documentação complementar
├── src/
│   ├── app.js            # Criação da aplicação Express (sem abrir porta)
│   ├── server.js         # Inicialização HTTP e encerramento gracioso
│   ├── config/           # Ambiente, logger e clientes externos
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   └── utils/
└── tests/
    └── unit/             # Testes unitários e de rotas sem banco
```

## Pré-requisitos

- Node.js 22.12 ou superior (recomendado 24, ver `.nvmrc`).
- npm 10 ou superior.

## Instalação local

```bash
git clone https://github.com/MatDev435/cupqy-server.git
cd cupqy-server
npm install
cp .env.example .env   # preencha as variáveis
npm run dev
```

A API sobe em `http://localhost:3333`. Verifique com `curl http://localhost:3333/health`.

## Variáveis de ambiente

Todas as variáveis estão documentadas em [`.env.example`](.env.example). A aplicação valida as
variáveis na inicialização e encerra com uma mensagem clara (sem expor valores) se algo estiver
inválido.

| Variável       | Descrição                                                       | Padrão                  |
| -------------- | --------------------------------------------------------------- | ----------------------- |
| `NODE_ENV`     | `development`, `test` ou `production`                           | `development`           |
| `PORT`         | Porta HTTP (o Render injeta automaticamente)                    | `3333`                  |
| `LOG_LEVEL`    | Nível de log do Pino                                            | `info` em produção      |
| `CORS_ORIGINS` | Origens permitidas (vírgula); aceita `https://app-*.vercel.app` | `http://localhost:5173` |
| `TRUST_PROXY`  | Proxies confiáveis à frente da API                              | `1`                     |
| `FORCE_HTTPS`  | Exige HTTPS                                                     | `true` em produção      |
| `RATE_LIMIT_*` | Limite global de requisições por IP                             | 1000 a cada 15 min      |

## Testes

```bash
npm test               # todos os testes
npm run test:unit      # apenas unitários
npm run test:coverage  # com cobertura (relatório em coverage/)
```

Os testes não dependem de serviços externos: Supabase, Mercado Pago e APIs de CEP são simulados.

## Endpoints

| Método | Rota            | Descrição                                    | Acesso  |
| ------ | --------------- | -------------------------------------------- | ------- |
| GET    | `/health`       | Liveness (usado pelo health check do Render) | Público |
| GET    | `/health/ready` | Readiness (verifica dependências)            | Público |
| GET    | `/api/v1`       | Informações da API                           | Público |

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

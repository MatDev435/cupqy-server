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
├── prisma/
│   ├── schema.prisma     # Modelo de dados
│   ├── migrations/       # Migrations versionadas
│   └── seed.js           # Dados de exemplo (catálogo e estoque)
├── scripts/              # Utilitários (banco local, setup do Storage, promoção de admin)
├── supabase/sql/         # RLS, triggers do Auth e Realtime (específicos do Supabase)
├── src/
│   ├── app.js            # Criação da aplicação Express (sem abrir porta)
│   ├── server.js         # Inicialização HTTP e encerramento gracioso
│   ├── config/           # Ambiente, logger e clientes externos
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validators/
│   └── views/
└── tests/
    ├── helpers/          # Fábricas de dados e utilitários de teste
    ├── integration/      # Rotas e regras de negócio contra PostgreSQL real
    └── unit/             # Testes unitários (sem banco)
```

## Pré-requisitos

- Node.js 22.12 ou superior (recomendado 24, ver `.nvmrc`).
- npm 10 ou superior.

## Instalação local

```bash
git clone https://github.com/MatDev435/cupqy-server.git
cd cupqy-server
npm install            # também gera o Prisma Client
cp .env.example .env   # preencha as variáveis
npm run db:deploy      # aplica as migrations
npm run db:seed -- --with-stock   # (opcional) catálogo de exemplo + estoque de hoje
npm run dev
```

A API sobe em `http://localhost:3333`. Verifique com `curl http://localhost:3333/health/ready`.

> **Sem projeto no Supabase ainda?** Rode `npm run db:local` em outro terminal: ele sobe um
> PostgreSQL local (binário embutido, sem Docker) em `postgresql://postgres:postgres@127.0.0.1:54329/cupqy`.
> Use essa URL em `DATABASE_URL` para desenvolver o que não depende do Supabase Auth.

## Variáveis de ambiente

Todas as variáveis estão documentadas em [`.env.example`](.env.example). A aplicação valida as
variáveis na inicialização e encerra com uma mensagem clara (sem expor valores) se algo estiver
inválido.

| Variável            | Descrição                                                       | Padrão                  |
| ------------------- | --------------------------------------------------------------- | ----------------------- |
| `NODE_ENV`          | `development`, `test` ou `production`                           | `development`           |
| `PORT`              | Porta HTTP (o Render injeta automaticamente)                    | `3333`                  |
| `LOG_LEVEL`         | Nível de log do Pino                                            | `info` em produção      |
| `CORS_ORIGINS`      | Origens permitidas (vírgula); aceita `https://app-*.vercel.app` | `http://localhost:5173` |
| `TRUST_PROXY`       | Proxies confiáveis à frente da API                              | `1`                     |
| `FORCE_HTTPS`       | Exige HTTPS                                                     | `true` em produção      |
| `RATE_LIMIT_*`      | Limite global de requisições por IP                             | 1000 a cada 15 min      |
| `DATABASE_URL`      | Conexão da API (pooler do Supabase, modo transação, porta 6543) | **obrigatória**         |
| `DIRECT_URL`        | Conexão das migrations (pooler, modo sessão, porta 5432)        | usa `DATABASE_URL`      |
| `DATABASE_POOL_MAX` | Conexões simultâneas por instância                              | `10`                    |
| `DATABASE_SSL_CA`   | Certificado da CA do Supabase (PEM) para validar TLS            | —                       |
| `STORE_TIMEZONE`    | Fuso horário da loja (estoque diário e relatórios)              | `America/Sao_Paulo`     |

## Banco de dados

O modelo de dados está em [`prisma/schema.prisma`](prisma/schema.prisma). Pontos importantes:

- **Sem duplicar o Supabase Auth**: a tabela `profiles` guarda apenas dados complementares e o
  papel do usuário; o `id` é o mesmo UUID de `auth.users`.
- **Dinheiro em centavos** (inteiros) para evitar erros de arredondamento.
- **Integridade no banco**: CHECKs garantem preço positivo, estoque não negativo, total do pedido
  consistente e frete zero na retirada; `order_items` usa `RESTRICT`, impedindo apagar fisicamente
  um cupcake já vendido.
- **Histórico fiel**: itens do pedido guardam nome e preço do momento da compra; o endereço de
  entrega é copiado para o pedido.
- **Número do pedido** amigável a partir de `#1001`.
- **RLS habilitado em todas as tabelas**: o acesso direto pela API REST do Supabase (chaves
  anon/authenticated) é negado por padrão; a API conecta como dona das tabelas.

### Configuração do Supabase (banco)

1. Crie um projeto em [supabase.com](https://supabase.com) (região `South America (São Paulo)`).
2. Em **Project Settings → Database → Connection string**, copie:
   - **Transaction pooler** (porta 6543) → `DATABASE_URL`
   - **Session pooler** (porta 5432) → `DIRECT_URL`
     (o Render não tem saída IPv6, por isso use sempre o pooler, e não a conexão direta).
3. Aplique as migrations: `npm run db:deploy`.
4. Aplique o SQL específico do Supabase: `npm run db:supabase` (ou cole os arquivos de
   [`supabase/sql/`](supabase/sql) no **SQL Editor**, na ordem). Ele configura:
   - políticas RLS de **leitura** para o Supabase Realtime (cliente vê só os próprios pedidos;
     confeiteiro/admin veem todos; estoque do dia é público);
   - revogação de escrita direta para `anon`/`authenticated`;
   - trigger que cria o perfil (sempre `CUSTOMER`) no cadastro;
   - trigger de anonimização (LGPD) caso um usuário seja removido pelo painel;
   - publicação das tabelas `orders`, `order_status_history` e `daily_stock` no Realtime.
5. (Opcional) `npm run db:seed -- --with-stock` para dados de exemplo.

## Autenticação e autorização

A autenticação é **inteiramente gerenciada pelo Supabase Auth**. A API não cria JWTs, não
armazena senhas e não implementa login.

| Responsabilidade                                           | Onde                    |
| ---------------------------------------------------------- | ----------------------- |
| Cadastro, login, logout, sessão e renovação de tokens      | Front-end (supabase-js) |
| Recuperação de senha (link por e-mail, enviado via Resend) | Supabase Auth + Resend  |
| Validar o Access Token e identificar o usuário             | API (`authenticate`)    |
| Papéis e permissões (RBAC)                                 | API (`authorize`)       |

Fluxo de uma requisição protegida:

1. O front-end envia `Authorization: Bearer <access_token>` (obtido com `supabase.auth.getSession()`).
2. O middleware `authenticate` valida o token com `supabase.auth.getUser(token)` — sessões
   encerradas no logout deixam de ser aceitas.
3. O perfil local é carregado (ou criado como `CUSTOMER` no primeiro acesso) e o **papel é lido do
   banco** — nunca de dados enviados pelo cliente ou dos metadados editáveis do Supabase.
4. O middleware `authorize(permissão)` verifica o RBAC antes de chegar ao controller.

| Código de erro     | Status | Situação                               |
| ------------------ | ------ | -------------------------------------- |
| `MISSING_TOKEN`    | 401    | Cabeçalho `Authorization` ausente      |
| `INVALID_TOKEN`    | 401    | Token malformado, expirado ou revogado |
| `ACCOUNT_DELETED`  | 403    | Conta encerrada (LGPD)                 |
| `FORBIDDEN`        | 403    | Papel sem permissão para a rota        |
| `AUTH_UNAVAILABLE` | 503    | Supabase Auth indisponível             |

### Papéis (RBAC)

| Permissão                               | Cliente | Confeiteiro | Administrador |
| --------------------------------------- | :-----: | :---------: | :-----------: |
| Perfil e endereços próprios             |   ✅    |     ✅      |      ✅       |
| Criar e acompanhar os próprios pedidos  |   ✅    |     ✅      |      ✅       |
| Painel da cozinha / ver qualquer pedido |    —    |     ✅      |      ✅       |
| Produtos, categorias e imagens          |    —    |      —      |      ✅       |
| Estoque diário                          |    —    |      —      |      ✅       |
| Gestão de pedidos e reembolsos          |    —    |      —      |      ✅       |
| Dashboard financeiro                    |    —    |      —      |      ✅       |
| Gestão de usuários e papéis             |    —    |      —      |      ✅       |

O mapa completo está em [`src/config/permissions.js`](src/config/permissions.js).

### Configuração do Supabase Auth

No painel do Supabase (**Authentication**):

1. **Sign In / Providers → Email**: habilite o provedor de e-mail e **Confirm email**.
2. **Policies de senha** (_Authentication → Sign In / Providers → Password_): mínimo de **8
   caracteres** exigindo **letras e dígitos** (US01 — RN#02).
3. **Expiração do link de confirmação**: em _Email → OTP Expiration_, use `86400` segundos (24 h;
   o link é de uso único — US01 — RN#03).
4. **URL Configuration**:
   - _Site URL_: URL do front-end em produção (ex.: `https://cupqy.vercel.app`).
   - _Redirect URLs_: `http://localhost:5173/**`, `https://cupqy.vercel.app/**` e, para previews,
     `https://cupqy-*.vercel.app/**`.
5. **Recuperação de senha** (fluxo nativo, baseado em link — substitui o código de 6 dígitos do
   documento original):
   1. O front-end chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://cupqy.vercel.app/redefinir-senha' })`.
      O Supabase responde sucesso mesmo para e-mails inexistentes (evita enumeração de contas).
   2. O usuário recebe o e-mail (entregue pelo Resend) e abre o link.
   3. O front-end, na rota `/redefinir-senha`, recebe o evento `PASSWORD_RECOVERY` e chama
      `supabase.auth.updateUser({ password })`.
   - Não existem tabelas, códigos ou endpoints de recuperação na API.
6. **Bot and Abuse Protection**: habilite o **CAPTCHA** (hCaptcha ou Cloudflare Turnstile) para
   proteger login e cadastro contra tentativas automatizadas (US02).
7. **Cadastro com nome e telefone**: o front-end envia os dados em `options.data`:
   `supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } })`.
   O trigger de `supabase/sql/01_security.sql` cria o perfil com esses dados (papel sempre `CUSTOMER`).

### Configuração do Resend (SMTP do Supabase Auth)

O Resend é usado **apenas** como servidor SMTP do Supabase Auth (confirmação de cadastro e
recuperação de senha). A API não envia e-mails diretamente.

1. Em [resend.com](https://resend.com), adicione e **verifique o domínio** de envio (ex.:
   `cupqy.com.br`), criando os registros DNS de **SPF** e **DKIM** indicados (US01 — RNF#02,
   evita que os e-mails caiam no spam). Recomenda-se também um registro **DMARC**.
2. Crie uma **API Key** com permissão de envio.
3. No Supabase, em **Authentication → Emails → SMTP Settings**, habilite _Custom SMTP_:

   | Campo        | Valor                                 |
   | ------------ | ------------------------------------- |
   | Host         | `smtp.resend.com`                     |
   | Port         | `465`                                 |
   | Username     | `resend`                              |
   | Password     | a API Key do Resend                   |
   | Sender email | `nao-responda@seu-dominio-verificado` |
   | Sender name  | `Cupqy`                               |

4. Em **Authentication → Emails → Templates**, personalize os textos de _Confirm signup_ e
   _Reset password_ em português.
5. Ajuste o _rate limit_ de e-mails em **Authentication → Rate Limits** (com SMTP próprio o limite
   padrão de 2 e-mails/hora deixa de valer).

As credenciais do Resend ficam somente no painel do Supabase — não há variáveis de ambiente do
Resend nesta API.

## Testes

```bash
npm test                  # todos os testes (unitários + integração)
npm run test:unit         # apenas unitários (rápidos, sem banco)
npm run test:integration  # integração contra PostgreSQL real
npm run test:coverage     # com cobertura (relatório em coverage/)
```

- **Unitários** (`tests/unit`): regras de negócio, middlewares, validações e utilitários.
- **Integração** (`tests/integration`): rotas completas via Supertest contra um **PostgreSQL real**,
  iniciado automaticamente pelo pacote `embedded-postgres` (sem Docker). As migrations são aplicadas
  a cada execução, e os scripts de `supabase/sql/` são validados com stubs do schema `auth`.
  Para usar um servidor existente (ex.: no CI), defina `TEST_DATABASE_URL`.
- Nenhum teste depende de serviços externos: Supabase Auth/Storage, Mercado Pago e APIs de CEP
  são simulados.

## Endpoints

Prefixo da API: `/api/v1`. Rotas protegidas exigem `Authorization: Bearer <access_token do Supabase>`.

### Infraestrutura

| Método | Rota            | Descrição                                    | Acesso  |
| ------ | --------------- | -------------------------------------------- | ------- |
| GET    | `/health`       | Liveness (usado pelo health check do Render) | Público |
| GET    | `/health/ready` | Readiness (verifica o banco de dados)        | Público |
| GET    | `/api/v1`       | Informações da API                           | Público |

### Perfil e endereços

| Método | Rota                                    | Descrição                                  | Acesso      |
| ------ | --------------------------------------- | ------------------------------------------ | ----------- |
| GET    | `/api/v1/users/me`                      | Perfil, papel e permissões do usuário      | Autenticado |
| PATCH  | `/api/v1/users/me`                      | Atualiza nome e telefone                   | Autenticado |
| GET    | `/api/v1/users/me/addresses`            | Lista endereços salvos (padrão primeiro)   | Autenticado |
| POST   | `/api/v1/users/me/addresses`            | Salva endereço (máx. 10; o 1º vira padrão) | Autenticado |
| GET    | `/api/v1/users/me/addresses/:addressId` | Detalha um endereço                        | Autenticado |
| PATCH  | `/api/v1/users/me/addresses/:addressId` | Atualiza endereço (ou define como padrão)  | Autenticado |
| DELETE | `/api/v1/users/me/addresses/:addressId` | Remove endereço                            | Autenticado |

### Administração — usuários

| Método | Rota                               | Descrição                                                      | Acesso |
| ------ | ---------------------------------- | -------------------------------------------------------------- | ------ |
| GET    | `/api/v1/admin/users`              | Lista usuários (`search`, `role`, `includeDeleted`, paginação) | Admin  |
| GET    | `/api/v1/admin/users/:userId`      | Detalha um usuário                                             | Admin  |
| PATCH  | `/api/v1/admin/users/:userId/role` | Altera o papel (`CUSTOMER`, `BAKER`, `ADMIN`)                  | Admin  |

Regras: o administrador não altera o próprio papel (`CANNOT_CHANGE_OWN_ROLE`) e o sistema nunca
fica sem administrador (`LAST_ADMIN`, protegido inclusive contra alterações simultâneas).

**Primeiro administrador:** depois de se cadastrar no app, rode
`npm run admin:promote -- seu-email@dominio.com` (aceita `BAKER` como segundo argumento).

## Scripts

| Comando                    | Descrição                                                     |
| -------------------------- | ------------------------------------------------------------- |
| `npm run dev`              | Inicia a API em modo desenvolvimento (reinicia ao salvar).    |
| `npm start`                | Inicia a API em modo produção.                                |
| `npm test`                 | Executa todos os testes.                                      |
| `npm run test:unit`        | Executa apenas os testes unitários.                           |
| `npm run test:integration` | Executa os testes de integração (PostgreSQL embutido).        |
| `npm run test:coverage`    | Executa os testes com relatório de cobertura.                 |
| `npm run lint`             | Verifica o código com ESLint.                                 |
| `npm run format`           | Formata o código com Prettier.                                |
| `npm run db:deploy`        | Aplica as migrations pendentes.                               |
| `npm run db:migrate`       | Cria/aplica migrations em desenvolvimento.                    |
| `npm run db:supabase`      | Aplica RLS, triggers e Realtime do Supabase.                  |
| `npm run db:seed`          | Popula o catálogo (`-- --with-stock` inclui estoque de hoje). |
| `npm run db:local`         | Sobe um PostgreSQL local sem Docker (porta 54329).            |
| `npm run db:studio`        | Abre o Prisma Studio.                                         |

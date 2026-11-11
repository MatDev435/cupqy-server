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

### Configuração do Mercado Pago (sandbox)

Todo o desenvolvimento e a apresentação usam o **ambiente de testes** — nenhum dinheiro real é
movimentado.

1. Acesse [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel) e
   crie uma aplicação do tipo **Pagamentos online → Checkout Pro**.
2. Em **Contas de teste**, crie dois usuários de teste: um **vendedor** e um **comprador**.
3. Faça login com o **vendedor de teste**, abra a aplicação e copie o **Access Token** das
   credenciais de teste para `MERCADOPAGO_ACCESS_TOKEN`. Mantenha `MERCADOPAGO_SANDBOX=true`.
4. Configure os webhooks (**Suas integrações → aplicação → Webhooks → Configurar notificações**):
   - **URL (modo de teste)**: `https://<sua-api>.onrender.com/api/v1/payments/webhooks/mercadopago`
   - **Evento**: _Pagamentos_
   - Copie a **assinatura secreta** gerada para `MERCADOPAGO_WEBHOOK_SECRET`.
   - Defina também `API_PUBLIC_URL=https://<sua-api>.onrender.com` (a preferência envia a
     `notification_url` com `source_news=webhooks`).
5. Defina `FRONTEND_URL` com a URL do front-end (em HTTPS o retorno automático é ativado).
6. Para pagar, abra o `checkoutUrl` retornado pelo checkout logado com o **comprador de teste** e use
   os [cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-cards)
   — o nome do titular define o resultado: `APRO` (aprovado), `OTHE` (recusado), `CONT` (pendente).
   O Pix de teste também pode ser usado no sandbox.

> **Desenvolvimento local**: sem URL pública o Mercado Pago não consegue entregar webhooks em
> `localhost`. Nesse caso o front-end deve chamar `POST /orders/:id/payment/sync` ao voltar do
> Checkout Pro — a API consulta o pagamento no Mercado Pago e confirma o pedido da mesma forma.

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

### Catálogo (público)

| Método | Rota                          | Descrição                                                          | Acesso  |
| ------ | ----------------------------- | ------------------------------------------------------------------ | ------- |
| GET    | `/api/v1/cupcakes`            | Lista o catálogo com busca, filtros, ordenação e paginação         | Público |
| GET    | `/api/v1/cupcakes/flavors`    | Sabores disponíveis (para os filtros rápidos)                      | Público |
| GET    | `/api/v1/cupcakes/:cupcakeId` | Detalhes: ingredientes, peso, tamanho, tabela nutricional, estoque | Público |
| GET    | `/api/v1/categories`          | Categorias                                                         | Público |
| GET    | `/api/v1/dietary-tags`        | Restrições alimentares (Sem Lactose, Vegano...)                    | Público |

Parâmetros de `GET /cupcakes`:

| Parâmetro          | Exemplo                           | Descrição                                          |
| ------------------ | --------------------------------- | -------------------------------------------------- |
| `search`           | `choco`                           | Nome parcial, sem diferenciar maiúsculas           |
| `category`         | `classicos,frutados`              | Slugs de categoria (qualquer um)                   |
| `flavor`           | `Chocolate`                       | Sabores (qualquer um)                              |
| `dietaryTags`      | `sem-lactose,vegano`              | Restrições (o cupcake precisa atender a **todas**) |
| `includeSoldOut`   | `true`                            | Inclui esgotados (padrão: apenas com estoque hoje) |
| `sort`             | `name`, `price_asc`, `price_desc` | Ordenação                                          |
| `page`, `pageSize` | `1`, `20`                         | Paginação (máx. 50 por página)                     |

Cada cupcake traz `priceCents` (centavos), `imageUrl` (URL pública do Supabase Storage) e
`stock: { available, soldOut }` referente ao **dia atual no fuso da loja**. Para refletir o
"Esgotado" em tempo real, o front-end pode assinar a tabela `daily_stock` via Supabase Realtime.

### Loja e frete

| Método | Rota                        | Descrição                                                | Acesso      |
| ------ | --------------------------- | -------------------------------------------------------- | ----------- |
| GET    | `/api/v1/store`             | Endereço da loja, prazo de retirada e regras de frete    | Público     |
| GET    | `/api/v1/shipping/cep/:cep` | Autocompleta rua, bairro, cidade e UF pelo CEP           | Público     |
| POST   | `/api/v1/shipping/quote`    | Cota frete e prazo (`PICKUP` ou `DELIVERY` com endereço) | Autenticado |

Corpo de `POST /shipping/quote`:

```jsonc
{ "fulfillmentType": "PICKUP" }
// ou endereço salvo
{ "fulfillmentType": "DELIVERY", "addressId": "<uuid>" }
// ou endereço informado na hora
{ "fulfillmentType": "DELIVERY", "address": { "zipCode": "01310-100", "street": "Av. Paulista",
  "number": "1000", "complement": "Apto 12", "neighborhood": "Bela Vista", "city": "São Paulo", "state": "SP" } }
```

Como o frete é calculado (US09):

- **Retirada:** frete R$ 0,00 e prazo = tempo médio de preparo.
- **Delivery:** o endereço é geocodificado (coordenadas do CEP pela **BrasilAPI**; se não houver,
  busca do endereço completo no **Nominatim/OpenStreetMap**). A distância em linha reta até a loja
  (Haversine) é multiplicada pelo fator de rota; `frete = taxa base + km × valor por km`. Endereços
  além do raio máximo recebem `422 DELIVERY_OUT_OF_RANGE`.
- Coordenadas de endereços salvos ficam em cache no banco (e há um cache em memória de 24 h), evitando
  consultas repetidas às APIs externas.
- Autocomplete de CEP: BrasilAPI, com **ViaCEP** como alternativa.
- O checkout **recalcula** o frete no servidor — o valor enviado pelo front-end nunca é usado.

### Carrinho

| Método | Rota                    | Descrição                                                                         | Acesso  |
| ------ | ----------------------- | --------------------------------------------------------------------------------- | ------- |
| POST   | `/api/v1/cart/validate` | Valida itens com preços e estoque atuais (`{ items: [{ cupcakeId, quantity }] }`) | Público |

O carrinho é mantido no front-end (persistido localmente). A API devolve cada item com
`unitPriceCents` e `subtotalCents` **calculados no servidor**, `availableQuantity` e `status`
(`OK`, `SOLD_OUT`, `INSUFFICIENT_STOCK`, `UNAVAILABLE`), além de `subtotalCents`, `issues` e
`canCheckout` (falso se algum item estiver indisponível ou o total for zero — US08 RN#02).
Limites: até 50 unidades por item e 30 cupcakes diferentes.

### Pedidos

| Método | Rota                             | Descrição                                                  | Acesso                   |
| ------ | -------------------------------- | ---------------------------------------------------------- | ------------------------ |
| POST   | `/api/v1/orders`                 | Finaliza o checkout e cria o pedido                        | Autenticado              |
| GET    | `/api/v1/orders?scope=`          | Meus pedidos (`active`, `history` ou `all`; 20 por página) | Autenticado              |
| GET    | `/api/v1/orders/:orderId`        | Detalhes e acompanhamento do pedido                        | Dono, confeiteiro, admin |
| POST   | `/api/v1/orders/:orderId/cancel` | Cancela o próprio pedido enquanto aguarda pagamento        | Dono                     |

Corpo do checkout (`POST /orders`):

```json
{
  "fulfillmentType": "DELIVERY",
  "address": {
    "zipCode": "01310-100",
    "street": "Av. Paulista",
    "number": "1000",
    "neighborhood": "Bela Vista",
    "city": "São Paulo",
    "state": "SP"
  },
  "saveAddress": true,
  "notes": "Sem granulado, por favor",
  "items": [{ "cupcakeId": "<uuid>", "quantity": 2 }]
}
```

Regras do checkout:

- O carrinho é **reavaliado no servidor** (preço atual, cupcake ativo e estoque do dia); itens
  indisponíveis retornam `409 CART_UNAVAILABLE` com a lista de problemas.
- Frete e total são **recalculados no servidor**; campos de valores no corpo são rejeitados.
- O pedido nasce como `AWAITING_PAYMENT` (US10 RN#03) e guarda nome e preço de cada item no
  momento da compra. O **estoque não é reservado** — a baixa ocorre na confirmação do pagamento.
- `saveAddress` (US09 RN#03) salva o endereço informado no perfil quando o pagamento for confirmado.
- O pedido expira após `PAYMENT_EXPIRATION_MINUTES` sem pagamento.
- A resposta inclui `checkout: { preferenceId, checkoutUrl, sandbox, expiresAt }`: o front-end
  redireciona o cliente para `checkoutUrl` (Checkout Pro), onde ele paga com **Pix ou cartão de
  crédito**. Se a preferência não puder ser criada, o pedido é cancelado e a API responde
  `502 PAYMENT_PROVIDER_ERROR`.

**Repetir pedido** (US12): `POST /orders/:id/reorder` não cria um pedido — devolve um carrinho com
os mesmos cupcakes usando os **preços atuais** (RN#02), apenas com o que tem estoque hoje
(quantidades ajustadas em `adjusted`) e a lista `unavailable` para o aviso em tela (RN#01). O
front-end adiciona `items` ao carrinho local.

Os detalhes trazem itens, valores, pagamento, `progress` (linha do tempo para a tela de
acompanhamento — US11) e `statusHistory`. Informações de entrega só aparecem em pedidos de
delivery e o nome do entregador só depois da saída para entrega.

| Status             | Rótulo                | Fluxo            |
| ------------------ | --------------------- | ---------------- |
| `AWAITING_PAYMENT` | Aguardando pagamento  | inicial          |
| `IN_PREPARATION`   | Em preparo            | após o pagamento |
| `AWAITING_COURIER` | Aguardando entregador | delivery         |
| `OUT_FOR_DELIVERY` | Saiu para entrega     | delivery         |
| `AWAITING_PICKUP`  | Pronto para retirada  | retirada         |
| `COMPLETED`        | Concluído             | final            |
| `CANCELLED`        | Cancelado             | final            |

### Pagamentos (Mercado Pago)

| Método | Rota                                    | Descrição                        | Acesso                         |
| ------ | --------------------------------------- | -------------------------------- | ------------------------------ |
| POST   | `/api/v1/payments/webhooks/mercadopago` | Recebe notificações de pagamento | Mercado Pago (assinatura HMAC) |

Fluxo completo do pagamento:

```
Front-end ── POST /orders ──────────────► API cria o pedido (AWAITING_PAYMENT) + preferência
Front-end ◄─ checkout.checkoutUrl ──────── API
Cliente paga no Checkout Pro (Pix ou cartão)
Mercado Pago ── webhook assinado ───────► API valida x-signature → consulta o pagamento no MP
                                           → confirma o pedido e baixa o estoque (transação)
Cliente volta para FRONTEND_URL/pedidos/:id?pagamento=...
Front-end ── POST /orders/:id/payment/sync ► API consulta o MP (caso o webhook ainda não tenha chegado)
Front-end acompanha o status via GET /orders/:id ou Supabase Realtime
```

Garantias de integridade:

- **A confirmação nunca vem do redirecionamento**: tanto o webhook quanto a sincronização consultam
  o pagamento diretamente na API do Mercado Pago, que é a fonte da verdade.
- **Webhook autenticado**: o cabeçalho `x-signature` é validado (HMAC-SHA256 do manifesto
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com `MERCADOPAGO_WEBHOOK_SECRET`, comparação em
  tempo constante). Assinatura inválida → `401`; segredo ausente → `503` (o MP reenvia depois).
- **Idempotência**: a linha do pedido é bloqueada durante o processamento (notificações duplicadas
  ou simultâneas são serializadas), o pagamento é único por `provider_payment_id`, as transições só
  ocorrem a partir do status esperado e os reembolsos usam `X-Idempotency-Key`.
- **Valor conferido**: o valor e a moeda pagos precisam ser iguais ao total do pedido calculado pelo
  servidor; caso contrário o pedido é cancelado e o valor reembolsado.
- **Baixa de estoque atômica**: na mesma transação, as linhas de estoque do dia são bloqueadas
  (`SELECT ... FOR UPDATE`, sempre na mesma ordem) e decrementadas condicionalmente — compras
  simultâneas nunca vendem além do disponível.
- **Reembolso automático** quando o estoque acabou entre o checkout e o pagamento, quando o valor
  diverge, ou quando chega um pagamento aprovado para pedido já cancelado/já pago. Falhas de
  reembolso ficam registradas (`refundStatus: FAILED`) e são retentadas na próxima notificação.
- **Estornos/chargebacks** feitos no painel do Mercado Pago cancelam o pedido em andamento e devolvem
  o estoque (se no mesmo dia).
- **Expiração**: um job (a cada `EXPIRE_ORDERS_INTERVAL_SECONDS`) cancela pedidos não pagos após
  o prazo (`PAYMENT_EXPIRED`). Antes, consulta o Mercado Pago para não cancelar um pedido pago cujo
  webhook se perdeu. As execuções nunca se sobrepõem e o job para no encerramento do servidor.
  No plano gratuito do Render a instância "dorme" sem tráfego; o job retoma ao acordar.
- Pagamento **recusado** não cancela o pedido: o cliente pode tentar novamente
  (`POST /orders/:id/payment`). Nenhum dado de cartão passa pela API ou é armazenado.

### Cozinha

| Método | Rota                                      | Descrição                                                    | Acesso             |
| ------ | ----------------------------------------- | ------------------------------------------------------------ | ------------------ |
| GET    | `/api/v1/kitchen/orders`                  | Fila de pedidos pagos e ativos (`status`, `fulfillmentType`) | Confeiteiro, admin |
| POST   | `/api/v1/kitchen/orders/:orderId/advance` | Avança o pedido para a próxima etapa (botão de ação rápida)  | Confeiteiro, admin |

- A fila mostra apenas pedidos **pagos** e não finalizados, **do pagamento mais antigo para o mais
  recente** (US13 RN#01/RN#02), com tempo decorrido, itens, observações, cliente, tipo de entrega e
  `nextAction` (`nextStatus`, `label` para o botão e `requiresCourierName`).
- `advance` segue o fluxo do tipo de entrega (US14 RN#01) e aceita
  `{ "expectedStatus": "IN_PREPARATION", "courierName": "João" }`:
  - `courierName` é obrigatório ao passar para **Saiu para entrega** (exibido ao cliente — US11 CA#04);
  - `expectedStatus` ativa o controle otimista: se outra pessoa já avançou o pedido, a resposta é
    `409 ORDER_STATUS_CHANGED` (cliques simultâneos nunca pulam etapas).
- Cada alteração fica no histórico com o usuário responsável.

### Tempo real (Supabase Realtime)

A API grava as mudanças no banco e o **Supabase Realtime** as entrega ao front-end, com as políticas
RLS de `supabase/sql/01_security.sql` garantindo que cada usuário receba apenas o que pode ver:

```js
// Painel da cozinha: novos pedidos pagos e mudanças de status (confeiteiro/admin veem todos)
supabase
  .channel('cozinha')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => recarregarFila())
  .subscribe();

// Acompanhamento do cliente (RLS: apenas os próprios pedidos)
supabase
  .channel(`pedido-${orderId}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
    () => recarregarPedido(),
  )
  .subscribe();

// Catálogo: "Esgotado" em tempo real
supabase
  .channel('estoque')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_stock' }, atualizarEstoque)
  .subscribe();
```

Recomenda-se usar o evento apenas como **gatilho** e buscar os dados completos na API (que aplica
as regras de apresentação). Notificações push para o celular (US14 CA#04) dependem de um provedor de
push fora da stack definida; o acompanhamento em tempo real cobre a atualização do cliente no app.

### Administração — catálogo

| Método | Rota                                                 | Descrição                                                        | Acesso |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| GET    | `/api/v1/admin/cupcakes`                             | Lista ativos e inativos (`search`, `status`, `category`, `sort`) | Admin  |
| POST   | `/api/v1/admin/cupcakes`                             | Cadastra cupcake                                                 | Admin  |
| GET    | `/api/v1/admin/cupcakes/:cupcakeId`                  | Detalha (inclui inativos)                                        | Admin  |
| PATCH  | `/api/v1/admin/cupcakes/:cupcakeId`                  | Edita dados, preço, status, categoria e restrições               | Admin  |
| DELETE | `/api/v1/admin/cupcakes/:cupcakeId`                  | Exclui (lógica se já vendido; física caso contrário)             | Admin  |
| POST   | `/api/v1/admin/cupcakes/:cupcakeId/image/upload-url` | Gera URL assinada para upload da foto                            | Admin  |
| PUT    | `/api/v1/admin/cupcakes/:cupcakeId/image`            | Confirma o upload e vincula a foto (substitui a anterior)        | Admin  |
| DELETE | `/api/v1/admin/cupcakes/:cupcakeId/image`            | Remove a foto                                                    | Admin  |
| GET    | `/api/v1/admin/categories`                           | Lista categorias                                                 | Admin  |
| POST   | `/api/v1/admin/categories`                           | Cria categoria (slug gerado automaticamente)                     | Admin  |
| PATCH  | `/api/v1/admin/categories/:categoryId`               | Edita categoria                                                  | Admin  |
| DELETE | `/api/v1/admin/categories/:categoryId`               | Remove categoria sem cupcakes vinculados                         | Admin  |
| GET    | `/api/v1/admin/dietary-tags`                         | Lista restrições alimentares                                     | Admin  |
| POST   | `/api/v1/admin/dietary-tags`                         | Cria restrição                                                   | Admin  |
| PATCH  | `/api/v1/admin/dietary-tags/:dietaryTagId`           | Renomeia restrição                                               | Admin  |
| DELETE | `/api/v1/admin/dietary-tags/:dietaryTagId`           | Remove restrição (e seus vínculos)                               | Admin  |

Regras do catálogo:

- Preço em **centavos**, inteiro e maior que zero (`priceCents: 1290` = R$ 12,90).
- **Exclusão** (US15 — RN#01): cupcake já vendido é apenas **inativado** (`deletion: "soft"`),
  preservando o histórico de pedidos; cupcake nunca vendido é removido do banco junto com a
  imagem (`deletion: "hard"`). O banco também impede (FK `RESTRICT`) apagar um item vendido.
- `isActive: false` tira o cupcake do catálogo público sem excluí-lo.

#### Upload de imagens (Supabase Storage)

As fotos são enviadas **diretamente do front-end ao Supabase Storage**, sem trafegar pelo Express,
usando URLs assinadas geradas pela API somente para administradores:

```js
// 1. API valida admin, tipo (JPG/PNG/WebP) e tamanho (≤ 5 MB) e define o caminho do arquivo
const { data } = await api.post(`/admin/cupcakes/${id}/image/upload-url`, {
  contentType: file.type,
  sizeBytes: file.size,
});

// 2. Front-end envia o arquivo ao Storage com o token assinado (válido por 2 h)
await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file, {
  contentType: file.type,
});

// 3. API confere o arquivo no Storage (existência, tipo, tamanho) e vincula ao cupcake
await api.put(`/admin/cupcakes/${id}/image`, { path: data.path });
```

Segurança: o caminho é sempre `cupcakes/<id-do-cupcake>/<uuid>.<ext>` (definido pelo servidor);
arquivos inválidos são apagados; a imagem anterior é removida na substituição; o bucket é público
apenas para leitura, sem políticas de escrita para `anon`/`authenticated`, e tem tipos/tamanho
restringidos também na configuração do bucket. Nenhum binário é armazenado no PostgreSQL.

**Configuração do bucket:** `npm run storage:setup` cria (ou atualiza) o bucket definido em
`SUPABASE_STORAGE_BUCKET` como público, com limite de 5 MB e tipos `image/jpeg`, `image/png` e
`image/webp`.

### Administração — estoque diário

| Método | Rota                               | Descrição                                                                  | Acesso |
| ------ | ---------------------------------- | -------------------------------------------------------------------------- | ------ |
| GET    | `/api/v1/admin/stock?date=`        | Estoque do dia (padrão: hoje) com alertas e resumo                         | Admin  |
| GET    | `/api/v1/admin/stock/alerts?date=` | Apenas cupcakes ativos com estoque baixo ou esgotados                      | Admin  |
| PUT    | `/api/v1/admin/stock`              | Define quantidades em lote (`{ date?, items: [{ cupcakeId, quantity }] }`) | Admin  |
| PUT    | `/api/v1/admin/stock/:cupcakeId`   | Define a quantidade de um cupcake (use `0` para zerar)                     | Admin  |

Regras: o estoque é **por dia, no fuso da loja** — a quantidade definida representa o que ainda
pode ser vendido no dia. Dias passados não podem ser alterados (dias futuros podem ser planejados).
A gravação em lote é atômica. A **baixa automática** acontece na confirmação do pagamento, com
proteção contra compras simultâneas (ver Pedidos e Pagamentos).

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

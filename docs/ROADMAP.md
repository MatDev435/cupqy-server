# Roadmap de implementação — cupqy-server

Este arquivo registra o andamento incremental do back-end. Cada etapa só é marcada como
concluída depois de **testes executados com sucesso, documentação atualizada e commit realizado**.

> Para retomar o trabalho: procure a primeira etapa não marcada (`[ ]`).

## Etapas

- [x] **0. Inicialização do projeto** — package.json, lint, formatação, Vitest, estrutura de docs.
- [x] **1. Aplicação Express** — app/server, configuração de ambiente validada, logs estruturados,
      CORS, Helmet, tratamento centralizado de erros, health check, encerramento gracioso.
- [x] **2. Banco de dados** — schema Prisma, migration inicial, RLS, seed, SQL do Supabase,
      harness de testes de integração com Postgres embutido.
- [x] **3. Autenticação e autorização** — validação do token do Supabase Auth, criação de perfil,
      RBAC (cliente, confeiteiro, administrador).
- [x] **4. Perfil e endereços** — consulta/atualização de perfil e CRUD de endereços.
- [x] **5. Exclusão de conta (LGPD)** — confirmação de senha, bloqueio por pedidos ativos, anonimização.
- [x] **6. Gestão de usuários (admin)** — listagem e alteração de papéis.
- [x] **7. Catálogo público** — listagem, busca, filtros, detalhes, categorias e restrições.
- [x] **8. Gestão do catálogo (admin)** — CRUD de cupcakes, categorias e restrições; exclusão lógica.
- [x] **9. Imagens (Supabase Storage)** — URLs assinadas de upload, confirmação, substituição e remoção.
- [x] **10. Estoque diário** — gestão pelo admin, alertas de estoque baixo.
- [x] **11. Frete e loja** — consulta de CEP, geocodificação, cálculo de frete, informações da loja.
- [ ] **12. Carrinho** — validação de itens, preços e estoque.
- [ ] **13. Pedidos** — checkout, listagem, histórico paginado, detalhes, cancelamento.
- [ ] **14. Mercado Pago Checkout Pro** — preferências de pagamento.
- [ ] **15. Webhooks de pagamento** — validação de assinatura, consulta ao gateway, confirmação
      idempotente com baixa atômica de estoque, reembolso automático.
- [ ] **16. Expiração de pedidos não pagos** — job periódico.
- [ ] **17. Cozinha** — painel de pedidos ativos e avanço de status.
- [ ] **18. Repetir pedido** — reconstrução do carrinho com preços e estoque atuais.
- [ ] **19. Gestão de pedidos (admin)** — listagem geral e cancelamento com reembolso.
- [ ] **20. Dashboard financeiro** — faturamento e contagem de pedidos por período.
- [ ] **21. Documentação OpenAPI/Swagger**.
- [ ] **22. Deploy (Render) e CI** — render.yaml, GitHub Actions.

## Registro de decisões técnicas

| Decisão                                                              | Motivo                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma 7 com `prisma-client-js` + `@prisma/adapter-pg`               | Versão estável atual do Prisma; o gerador clássico funciona em JavaScript puro (ESM) sem etapa de build.                                                                                                   |
| Testes de integração com `embedded-postgres`                         | Postgres real (mesmo motor do Supabase) sem depender de Docker ou de serviços externos.                                                                                                                    |
| ESLint 9.39 (linha de manutenção)                                    | A linha 10 trazia alerta de segurança em dependência transitiva; a 9.39 mantém `npm audit` limpo.                                                                                                          |
| Valores monetários em centavos (inteiros)                            | Evita erros de ponto flutuante; convertidos para reais apenas na integração com o Mercado Pago.                                                                                                            |
| RLS habilitado em todas as tabelas, sem políticas de escrita         | O Supabase expõe `public` via PostgREST; só a API (dona das tabelas) escreve. Políticas de leitura existem apenas para o Realtime.                                                                         |
| Perfil criado por trigger no Supabase **e** sob demanda na API       | O trigger cobre o fluxo normal; a criação sob demanda garante funcionamento mesmo sem o SQL do Supabase aplicado.                                                                                          |
| Validação do token via `supabase.auth.getUser(token)`                | Método oficial; além da assinatura, confirma que a sessão não foi encerrada (logout revoga o acesso imediatamente).                                                                                        |
| Recuperação de senha nativa do Supabase (link por e-mail)            | Alteração de requisito: substitui o código de 6 dígitos do documento original; nenhuma tabela ou endpoint próprio.                                                                                         |
| Exclusão de conta: Supabase Auth primeiro, anonimização local depois | Se a exclusão no Auth falhar, nada muda e o usuário pode tentar de novo; o trigger `on_auth_user_deleted` também anonimiza, como redundância.                                                              |
| Senha incorreta na exclusão retorna 422 (não 401)                    | Evita que interceptadores do front-end interpretem como sessão expirada e façam logout.                                                                                                                    |
| Upload de imagens via URL assinada do Supabase Storage               | O arquivo vai direto do navegador ao Storage (não ocupa o Express); a API controla quem pode enviar e o caminho, e valida tipo/tamanho na confirmação.                                                     |
| Frete por distância em linha reta × fator de rota                    | Atende "valor fixo por km" sem depender de API paga de rotas; geocodificação gratuita (BrasilAPI + Nominatim) e fator configurável. Um provedor de rotas pode ser plugado em `shipping.service` no futuro. |

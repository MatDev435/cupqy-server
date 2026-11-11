/**
 * Especificação OpenAPI 3.1 da API do Cupqy.
 *
 * Os schemas de ENTRADA (corpo e query) são gerados a partir dos próprios validators Zod,
 * garantindo que a documentação reflita exatamente a validação aplicada pela API.
 */
import pkg from '../../package.json' with { type: 'json' };
import { z } from '../validators/zod.js';
import { createAddressBody, updateAddressBody } from '../validators/address.validator.js';
import { deleteAccountBody } from '../validators/account.validator.js';
import { validateCartBody } from '../validators/cart.validator.js';
import { listCupcakesQuery } from '../validators/catalog.validator.js';
import {
  attachImageBody,
  categoryBody,
  createCupcakeBody,
  dietaryTagBody,
  imageUploadBody,
  listAdminCupcakesQuery,
  updateCategoryBody,
  updateCupcakeBody,
} from '../validators/catalogAdmin.validator.js';
import { dashboardQuery } from '../validators/dashboard.validator.js';
import { advanceOrderBody, kitchenOrdersQuery } from '../validators/kitchen.validator.js';
import { adminCancelOrderBody, listAdminOrdersQuery } from '../validators/orderAdmin.validator.js';
import {
  createOrderBody,
  listOrdersQuery,
  syncPaymentBody,
} from '../validators/order.validator.js';
import { shippingQuoteBody } from '../validators/shipping.validator.js';
import { setSingleStockBody, setStockBody, stockDateQuery } from '../validators/stock.validator.js';
import { updateProfileBody } from '../validators/user.validator.js';
import { changeRoleBody, listUsersQuery } from '../validators/userAdmin.validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonSchema(schema) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  });
  return rest;
}

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema) => ({ type: 'array', items: schema });
const dataOf = (schema) => ({
  type: 'object',
  properties: { data: schema },
  required: ['data'],
});
const pageOf = (schema) => ({
  type: 'object',
  properties: { data: arrayOf(schema), meta: ref('PageMeta') },
  required: ['data', 'meta'],
});

function queryParameters(schema) {
  const shape = schema.shape ?? {};
  return Object.entries(shape).map(([name, field]) => ({
    name,
    in: 'query',
    required: false,
    schema: jsonSchema(field),
  }));
}

const pathParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

const COMMON_ERRORS = {
  400: errorResponse('Dados inválidos (VALIDATION_ERROR)'),
  429: errorResponse('Limite de requisições excedido'),
  500: errorResponse('Erro interno'),
};

const AUTH_ERRORS = {
  401: errorResponse('Token ausente, inválido ou expirado'),
  403: errorResponse('Sem permissão para o recurso / conta encerrada'),
};

/**
 * Monta uma operação.
 * @param {object} options
 */
function operation({
  tag,
  summary,
  description,
  auth = true,
  body,
  query,
  params = [],
  success = { status: 200, schema: null, description: 'Sucesso' },
  errors = {},
}) {
  const responses = {
    [success.status]: success.schema
      ? {
          description: success.description,
          content: { 'application/json': { schema: success.schema } },
        }
      : { description: success.description },
    ...COMMON_ERRORS,
    ...(auth ? AUTH_ERRORS : {}),
    ...Object.fromEntries(
      Object.entries(errors).map(([status, text]) => [status, errorResponse(text)]),
    ),
  };

  return {
    tags: [tag],
    summary,
    ...(description && { description }),
    ...(auth ? { security: [{ bearerAuth: [] }] } : { security: [] }),
    parameters: [...params, ...(query ? queryParameters(query) : [])],
    ...(body && {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: jsonSchema(body) } },
      },
    }),
    responses,
  };
}

// ---------------------------------------------------------------------------
// Schemas de resposta
// ---------------------------------------------------------------------------

const money = { type: 'integer', description: 'Valor em centavos (ex.: 1290 = R$ 12,90)' };
const dateTime = { type: 'string', format: 'date-time' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const orderStatus = {
  type: 'string',
  enum: [
    'AWAITING_PAYMENT',
    'IN_PREPARATION',
    'AWAITING_COURIER',
    'OUT_FOR_DELIVERY',
    'AWAITING_PICKUP',
    'COMPLETED',
    'CANCELLED',
  ],
};
const addressSnapshot = {
  type: 'object',
  properties: {
    zipCode: { type: 'string', example: '01310100' },
    street: { type: 'string' },
    number: { type: 'string' },
    complement: nullable({ type: 'string' }),
    neighborhood: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string', example: 'SP' },
  },
};

const schemas = {
  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'Dados inválidos.' },
          details: {},
        },
        required: ['code', 'message'],
      },
      requestId: { type: 'string' },
    },
    required: ['error'],
  },
  PageMeta: {
    type: 'object',
    properties: {
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  },
  Profile: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: nullable({ type: 'string' }),
      fullName: nullable({ type: 'string' }),
      phone: nullable({ type: 'string' }),
      role: { type: 'string', enum: ['CUSTOMER', 'BAKER', 'ADMIN'] },
      permissions: arrayOf({ type: 'string' }),
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  AdminUser: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: nullable({ type: 'string' }),
      fullName: nullable({ type: 'string' }),
      phone: nullable({ type: 'string' }),
      role: { type: 'string', enum: ['CUSTOMER', 'BAKER', 'ADMIN'] },
      deleted: { type: 'boolean' },
      createdAt: dateTime,
    },
  },
  Address: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      label: nullable({ type: 'string' }),
      ...addressSnapshot.properties,
      isDefault: { type: 'boolean' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Category: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      slug: { type: 'string' },
      description: nullable({ type: 'string' }),
    },
  },
  DietaryTag: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Sem Lactose' },
      slug: { type: 'string', example: 'sem-lactose' },
    },
  },
  Stock: {
    type: 'object',
    properties: { available: { type: 'integer' }, soldOut: { type: 'boolean' } },
  },
  CupcakeSummary: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      description: { type: 'string' },
      flavor: { type: 'string' },
      priceCents: money,
      imageUrl: nullable({ type: 'string', format: 'uri' }),
      category: nullable(ref('Category')),
      dietaryTags: arrayOf(ref('DietaryTag')),
      stock: ref('Stock'),
    },
  },
  CupcakeDetail: {
    allOf: [
      ref('CupcakeSummary'),
      {
        type: 'object',
        properties: {
          ingredients: { type: 'string' },
          weightGrams: nullable({ type: 'integer' }),
          size: nullable({ type: 'string' }),
          nutritionalInfo: nullable({ type: 'object', additionalProperties: { type: 'number' } }),
        },
      },
    ],
  },
  AdminCupcake: {
    allOf: [
      ref('CupcakeDetail'),
      {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          imagePath: nullable({ type: 'string' }),
          createdAt: dateTime,
          updatedAt: dateTime,
        },
      },
    ],
  },
  ImageUpload: {
    type: 'object',
    properties: {
      bucket: { type: 'string' },
      path: { type: 'string' },
      token: { type: 'string' },
      signedUrl: { type: 'string', format: 'uri' },
      expiresInSeconds: { type: 'integer' },
      contentType: { type: 'string' },
      maxSizeBytes: { type: 'integer' },
    },
  },
  StockOverview: {
    type: 'object',
    properties: {
      date: { type: 'string', format: 'date' },
      lowStockThreshold: { type: 'integer' },
      summary: { type: 'object' },
      items: arrayOf({
        type: 'object',
        properties: {
          cupcake: { type: 'object' },
          quantity: { type: 'integer' },
          isSet: { type: 'boolean' },
          lowStock: { type: 'boolean' },
          soldOut: { type: 'boolean' },
        },
      }),
    },
  },
  Store: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      address: { type: 'string' },
      timeZone: { type: 'string' },
      pickup: {
        type: 'object',
        properties: { feeCents: money, estimatedMinutes: { type: 'integer' } },
      },
      delivery: {
        type: 'object',
        properties: {
          baseFeeCents: money,
          feePerKmCents: money,
          maxDistanceKm: { type: 'number' },
        },
      },
    },
  },
  CepAddress: {
    type: 'object',
    properties: {
      zipCode: { type: 'string' },
      street: nullable({ type: 'string' }),
      neighborhood: nullable({ type: 'string' }),
      city: { type: 'string' },
      state: { type: 'string' },
    },
  },
  ShippingQuote: {
    type: 'object',
    properties: {
      fulfillmentType: { type: 'string', enum: ['DELIVERY', 'PICKUP'] },
      feeCents: money,
      distanceKm: nullable({ type: 'number' }),
      estimatedMinutes: { type: 'integer' },
      pickupAddress: nullable({ type: 'string' }),
      deliveryAddress: nullable(addressSnapshot),
    },
  },
  CartEvaluation: {
    type: 'object',
    properties: {
      stockDate: { type: 'string', format: 'date' },
      items: arrayOf({
        type: 'object',
        properties: {
          cupcakeId: { type: 'string', format: 'uuid' },
          name: nullable({ type: 'string' }),
          unitPriceCents: nullable(money),
          quantity: { type: 'integer' },
          availableQuantity: { type: 'integer' },
          subtotalCents: money,
          status: { type: 'string', enum: ['OK', 'SOLD_OUT', 'INSUFFICIENT_STOCK', 'UNAVAILABLE'] },
        },
      }),
      totalQuantity: { type: 'integer' },
      subtotalCents: money,
      issues: arrayOf({ type: 'object' }),
      canCheckout: { type: 'boolean' },
    },
  },
  Checkout: {
    type: 'object',
    properties: {
      preferenceId: { type: 'string' },
      checkoutUrl: { type: 'string', format: 'uri', description: 'URL do Checkout Pro' },
      sandbox: { type: 'boolean' },
      expiresAt: dateTime,
    },
  },
  OrderSummary: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      orderNumber: { type: 'integer', example: 1001 },
      status: orderStatus,
      statusLabel: { type: 'string' },
      fulfillmentType: { type: 'string', enum: ['DELIVERY', 'PICKUP'] },
      totalCents: money,
      itemsCount: { type: 'integer' },
      createdAt: dateTime,
      paidAt: nullable(dateTime),
      completedAt: nullable(dateTime),
      cancelledAt: nullable(dateTime),
    },
  },
  OrderDetail: {
    allOf: [
      ref('OrderSummary'),
      {
        type: 'object',
        properties: {
          subtotalCents: money,
          deliveryFeeCents: money,
          notes: nullable({ type: 'string' }),
          estimatedMinutes: nullable({ type: 'integer' }),
          delivery: nullable({
            type: 'object',
            properties: {
              address: addressSnapshot,
              distanceKm: { type: 'number' },
              courierName: nullable({ type: 'string' }),
            },
          }),
          pickup: nullable({ type: 'object', properties: { address: { type: 'string' } } }),
          items: arrayOf({
            type: 'object',
            properties: {
              cupcakeId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              unitPriceCents: money,
              quantity: { type: 'integer' },
              subtotalCents: money,
            },
          }),
          payment: nullable({ type: 'object' }),
          paymentExpiresAt: nullable(dateTime),
          cancellationReason: nullable({ type: 'string' }),
          progress: arrayOf({ type: 'object' }),
          statusHistory: arrayOf({ type: 'object' }),
        },
      },
    ],
  },
  OrderWithCheckout: {
    allOf: [ref('OrderDetail'), { type: 'object', properties: { checkout: ref('Checkout') } }],
  },
  ReorderCart: {
    type: 'object',
    properties: {
      sourceOrderId: { type: 'string', format: 'uuid' },
      items: arrayOf({ type: 'object' }),
      subtotalCents: money,
      adjusted: arrayOf({ type: 'object' }),
      unavailable: arrayOf({ type: 'object' }),
      canCheckout: { type: 'boolean' },
    },
  },
  KitchenOrder: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      orderNumber: { type: 'integer' },
      status: orderStatus,
      fulfillmentType: { type: 'string', enum: ['DELIVERY', 'PICKUP'] },
      elapsedMinutes: { type: 'integer' },
      items: arrayOf({ type: 'object' }),
      notes: nullable({ type: 'string' }),
      nextAction: nullable({
        type: 'object',
        properties: {
          nextStatus: orderStatus,
          label: { type: 'string' },
          requiresCourierName: { type: 'boolean' },
        },
      }),
    },
  },
  Dashboard: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['today', 'week', 'month'] },
      revenueCents: money,
      completedOrders: { type: 'integer' },
      averageTicketCents: money,
      revenueByFulfillment: { type: 'object' },
      inProgress: { type: 'object' },
      cancelledOrders: { type: 'integer' },
      ordersByStatus: { type: 'object' },
      daily: arrayOf({ type: 'object' }),
      topCupcakes: arrayOf({ type: 'object' }),
    },
  },
};

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const cupcakeId = pathParam('cupcakeId', 'Identificador do cupcake');
const orderId = pathParam('orderId', 'Identificador do pedido');

const paths = {
  '/health': {
    get: operation({ tag: 'Infraestrutura', summary: 'Liveness', auth: false }),
  },
  '/health/ready': {
    get: operation({
      tag: 'Infraestrutura',
      summary: 'Readiness (verifica o banco)',
      auth: false,
      errors: { 503: 'Dependência indisponível' },
    }),
  },

  // Perfil e endereços
  '/api/v1/users/me': {
    get: operation({
      tag: 'Perfil',
      summary: 'Perfil, papel e permissões do usuário autenticado',
      success: { status: 200, schema: dataOf(ref('Profile')), description: 'Perfil' },
    }),
    patch: operation({
      tag: 'Perfil',
      summary: 'Atualiza nome e telefone',
      body: updateProfileBody,
      success: { status: 200, schema: dataOf(ref('Profile')), description: 'Perfil atualizado' },
    }),
    delete: operation({
      tag: 'Perfil',
      summary: 'Exclui a conta (LGPD)',
      description:
        'Reconfirma a senha no Supabase Auth, bloqueia com pedidos em andamento, exclui o usuário do Auth e anonimiza os dados pessoais.',
      body: deleteAccountBody,
      success: { status: 204, description: 'Conta excluída' },
      errors: {
        409: 'Pedidos em andamento (ACTIVE_ORDERS_PENDING)',
        422: 'Senha incorreta (INVALID_PASSWORD)',
        502: 'Falha ao excluir no Supabase Auth',
      },
    }),
  },
  '/api/v1/users/me/addresses': {
    get: operation({
      tag: 'Perfil',
      summary: 'Lista endereços salvos',
      success: { status: 200, schema: dataOf(arrayOf(ref('Address'))), description: 'Endereços' },
    }),
    post: operation({
      tag: 'Perfil',
      summary: 'Salva um endereço',
      body: createAddressBody,
      success: { status: 201, schema: dataOf(ref('Address')), description: 'Endereço criado' },
      errors: { 422: 'Limite de endereços atingido' },
    }),
  },
  '/api/v1/users/me/addresses/{addressId}': {
    get: operation({
      tag: 'Perfil',
      summary: 'Detalha um endereço',
      params: [pathParam('addressId', 'Identificador do endereço')],
      success: { status: 200, schema: dataOf(ref('Address')), description: 'Endereço' },
      errors: { 404: 'Endereço não encontrado' },
    }),
    patch: operation({
      tag: 'Perfil',
      summary: 'Atualiza um endereço',
      params: [pathParam('addressId', 'Identificador do endereço')],
      body: updateAddressBody,
      success: { status: 200, schema: dataOf(ref('Address')), description: 'Endereço atualizado' },
      errors: { 404: 'Endereço não encontrado' },
    }),
    delete: operation({
      tag: 'Perfil',
      summary: 'Remove um endereço',
      params: [pathParam('addressId', 'Identificador do endereço')],
      success: { status: 204, description: 'Removido' },
      errors: { 404: 'Endereço não encontrado' },
    }),
  },

  // Catálogo
  '/api/v1/cupcakes': {
    get: operation({
      tag: 'Catálogo',
      summary: 'Lista o catálogo (busca, filtros, ordenação e paginação)',
      description: 'Por padrão, apenas cupcakes ativos e com estoque no dia atual da loja.',
      auth: false,
      query: listCupcakesQuery,
      success: { status: 200, schema: pageOf(ref('CupcakeSummary')), description: 'Cupcakes' },
    }),
  },
  '/api/v1/cupcakes/flavors': {
    get: operation({
      tag: 'Catálogo',
      summary: 'Sabores disponíveis',
      auth: false,
      success: { status: 200, schema: dataOf(arrayOf({ type: 'string' })), description: 'Sabores' },
    }),
  },
  '/api/v1/cupcakes/{cupcakeId}': {
    get: operation({
      tag: 'Catálogo',
      summary: 'Detalhes do cupcake',
      auth: false,
      params: [cupcakeId],
      success: { status: 200, schema: dataOf(ref('CupcakeDetail')), description: 'Cupcake' },
      errors: { 404: 'Cupcake não encontrado' },
    }),
  },
  '/api/v1/categories': {
    get: operation({
      tag: 'Catálogo',
      summary: 'Categorias',
      auth: false,
      success: { status: 200, schema: dataOf(arrayOf(ref('Category'))), description: 'Categorias' },
    }),
  },
  '/api/v1/dietary-tags': {
    get: operation({
      tag: 'Catálogo',
      summary: 'Restrições alimentares',
      auth: false,
      success: {
        status: 200,
        schema: dataOf(arrayOf(ref('DietaryTag'))),
        description: 'Restrições',
      },
    }),
  },

  // Loja, frete e carrinho
  '/api/v1/store': {
    get: operation({
      tag: 'Loja e frete',
      summary: 'Informações da loja e regras de frete',
      auth: false,
      success: { status: 200, schema: dataOf(ref('Store')), description: 'Loja' },
    }),
  },
  '/api/v1/shipping/cep/{cep}': {
    get: operation({
      tag: 'Loja e frete',
      summary: 'Autocompleta o endereço pelo CEP',
      auth: false,
      params: [
        {
          name: 'cep',
          in: 'path',
          required: true,
          schema: { type: 'string', example: '01310-100' },
        },
      ],
      success: { status: 200, schema: dataOf(ref('CepAddress')), description: 'Endereço' },
      errors: { 404: 'CEP não encontrado', 503: 'Serviço de CEP indisponível' },
    }),
  },
  '/api/v1/shipping/quote': {
    post: operation({
      tag: 'Loja e frete',
      summary: 'Cota frete e prazo',
      body: shippingQuoteBody,
      success: { status: 200, schema: dataOf(ref('ShippingQuote')), description: 'Cotação' },
      errors: {
        404: 'Endereço salvo não encontrado',
        422: 'Endereço não localizado ou fora da área de entrega',
        503: 'Geocodificação indisponível',
      },
    }),
  },
  '/api/v1/cart/validate': {
    post: operation({
      tag: 'Carrinho',
      summary: 'Valida itens com preços e estoque atuais',
      auth: false,
      body: validateCartBody,
      success: { status: 200, schema: dataOf(ref('CartEvaluation')), description: 'Avaliação' },
    }),
  },

  // Pedidos
  '/api/v1/orders': {
    post: operation({
      tag: 'Pedidos',
      summary: 'Finaliza o checkout (cria o pedido e a preferência do Checkout Pro)',
      body: createOrderBody,
      success: {
        status: 201,
        schema: dataOf(ref('OrderWithCheckout')),
        description: 'Pedido criado aguardando pagamento',
      },
      errors: {
        409: 'Itens indisponíveis ou muitos pedidos pendentes',
        422: 'Endereço inválido/fora da área de entrega',
        502: 'Falha no Mercado Pago (pedido cancelado)',
        503: 'Pagamentos ou geocodificação indisponíveis',
      },
    }),
    get: operation({
      tag: 'Pedidos',
      summary: 'Meus pedidos (histórico paginado)',
      query: listOrdersQuery,
      success: { status: 200, schema: pageOf(ref('OrderSummary')), description: 'Pedidos' },
    }),
  },
  '/api/v1/orders/{orderId}': {
    get: operation({
      tag: 'Pedidos',
      summary: 'Detalhes e acompanhamento do pedido',
      params: [orderId],
      success: { status: 200, schema: dataOf(ref('OrderDetail')), description: 'Pedido' },
      errors: { 404: 'Pedido não encontrado' },
    }),
  },
  '/api/v1/orders/{orderId}/payment': {
    post: operation({
      tag: 'Pedidos',
      summary: 'Gera um novo link de pagamento para pedido pendente',
      params: [orderId],
      success: { status: 201, schema: dataOf(ref('OrderWithCheckout')), description: 'Novo link' },
      errors: { 404: 'Pedido não encontrado', 409: 'Pedido não pagável ou expirado' },
    }),
  },
  '/api/v1/orders/{orderId}/payment/sync': {
    post: operation({
      tag: 'Pedidos',
      summary: 'Consulta o Mercado Pago e atualiza o pedido (retorno do Checkout Pro)',
      params: [orderId],
      body: syncPaymentBody,
      success: {
        status: 200,
        schema: dataOf(ref('OrderDetail')),
        description: 'Pedido atualizado',
      },
      errors: { 404: 'Pedido não encontrado', 502: 'Mercado Pago indisponível' },
    }),
  },
  '/api/v1/orders/{orderId}/reorder': {
    post: operation({
      tag: 'Pedidos',
      summary: 'Monta um carrinho para repetir o pedido',
      params: [orderId],
      success: { status: 200, schema: dataOf(ref('ReorderCart')), description: 'Carrinho' },
      errors: { 404: 'Pedido não encontrado' },
    }),
  },
  '/api/v1/orders/{orderId}/cancel': {
    post: operation({
      tag: 'Pedidos',
      summary: 'Cancela o próprio pedido aguardando pagamento',
      params: [orderId],
      success: { status: 200, schema: dataOf(ref('OrderDetail')), description: 'Pedido cancelado' },
      errors: { 404: 'Pedido não encontrado', 409: 'Pedido não pode ser cancelado' },
    }),
  },

  // Pagamentos
  '/api/v1/payments/webhooks/mercadopago': {
    post: operation({
      tag: 'Pagamentos',
      summary: 'Webhook de notificações do Mercado Pago',
      description:
        'Autenticado pela assinatura HMAC do cabeçalho x-signature. O pagamento é sempre consultado na API do Mercado Pago.',
      auth: false,
      params: [
        { name: 'data.id', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'type', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'x-signature', in: 'header', required: true, schema: { type: 'string' } },
        { name: 'x-request-id', in: 'header', required: true, schema: { type: 'string' } },
      ],
      success: { status: 200, schema: { type: 'object' }, description: 'Notificação recebida' },
      errors: {
        401: 'Assinatura inválida',
        502: 'Mercado Pago indisponível (será reenviado)',
        503: 'Webhook não configurado',
      },
    }),
  },

  // Cozinha
  '/api/v1/kitchen/orders': {
    get: operation({
      tag: 'Cozinha',
      summary: 'Fila de pedidos pagos e ativos',
      query: kitchenOrdersQuery,
      success: {
        status: 200,
        schema: {
          type: 'object',
          properties: { data: arrayOf(ref('KitchenOrder')), meta: { type: 'object' } },
        },
        description: 'Fila',
      },
    }),
  },
  '/api/v1/kitchen/orders/{orderId}/advance': {
    post: operation({
      tag: 'Cozinha',
      summary: 'Avança o pedido para a próxima etapa',
      params: [orderId],
      body: advanceOrderBody,
      success: {
        status: 200,
        schema: dataOf(ref('KitchenOrder')),
        description: 'Pedido atualizado',
      },
      errors: { 404: 'Pedido não está na cozinha', 409: 'Status alterado ou não pode avançar' },
    }),
  },

  // Administração
  '/api/v1/admin/cupcakes': {
    get: operation({
      tag: 'Admin — Catálogo',
      summary: 'Lista cupcakes (ativos e inativos)',
      query: listAdminCupcakesQuery,
      success: { status: 200, schema: pageOf(ref('AdminCupcake')), description: 'Cupcakes' },
    }),
    post: operation({
      tag: 'Admin — Catálogo',
      summary: 'Cadastra cupcake',
      body: createCupcakeBody,
      success: { status: 201, schema: dataOf(ref('AdminCupcake')), description: 'Criado' },
      errors: { 422: 'Categoria/restrição inexistente' },
    }),
  },
  '/api/v1/admin/cupcakes/{cupcakeId}': {
    get: operation({
      tag: 'Admin — Catálogo',
      summary: 'Detalha cupcake',
      params: [cupcakeId],
      success: { status: 200, schema: dataOf(ref('AdminCupcake')), description: 'Cupcake' },
      errors: { 404: 'Cupcake não encontrado' },
    }),
    patch: operation({
      tag: 'Admin — Catálogo',
      summary: 'Edita cupcake',
      params: [cupcakeId],
      body: updateCupcakeBody,
      success: { status: 200, schema: dataOf(ref('AdminCupcake')), description: 'Atualizado' },
      errors: { 404: 'Cupcake não encontrado', 422: 'Categoria/restrição inexistente' },
    }),
    delete: operation({
      tag: 'Admin — Catálogo',
      summary: 'Exclui cupcake (lógica se já vendido)',
      params: [cupcakeId],
      success: {
        status: 200,
        schema: dataOf({
          type: 'object',
          properties: {
            id: { type: 'string' },
            deletion: { type: 'string', enum: ['soft', 'hard'] },
          },
        }),
        description: 'Excluído',
      },
      errors: { 404: 'Cupcake não encontrado' },
    }),
  },
  '/api/v1/admin/cupcakes/{cupcakeId}/image/upload-url': {
    post: operation({
      tag: 'Admin — Catálogo',
      summary: 'Gera URL assinada para upload da foto (Supabase Storage)',
      params: [cupcakeId],
      body: imageUploadBody,
      success: { status: 201, schema: dataOf(ref('ImageUpload')), description: 'URL assinada' },
      errors: { 404: 'Cupcake não encontrado', 502: 'Falha no Storage' },
    }),
  },
  '/api/v1/admin/cupcakes/{cupcakeId}/image': {
    put: operation({
      tag: 'Admin — Catálogo',
      summary: 'Confirma o upload e vincula a foto',
      params: [cupcakeId],
      body: attachImageBody,
      success: { status: 200, schema: dataOf(ref('AdminCupcake')), description: 'Foto vinculada' },
      errors: { 404: 'Cupcake não encontrado', 422: 'Imagem inválida ou não enviada' },
    }),
    delete: operation({
      tag: 'Admin — Catálogo',
      summary: 'Remove a foto',
      params: [cupcakeId],
      success: { status: 200, schema: dataOf(ref('AdminCupcake')), description: 'Foto removida' },
      errors: { 404: 'Cupcake não encontrado' },
    }),
  },
  '/api/v1/admin/categories': {
    get: operation({
      tag: 'Admin — Catálogo',
      summary: 'Lista categorias',
      success: { status: 200, schema: dataOf(arrayOf(ref('Category'))), description: 'Categorias' },
    }),
    post: operation({
      tag: 'Admin — Catálogo',
      summary: 'Cria categoria',
      body: categoryBody,
      success: { status: 201, schema: dataOf(ref('Category')), description: 'Criada' },
      errors: { 409: 'Categoria já existe' },
    }),
  },
  '/api/v1/admin/categories/{categoryId}': {
    patch: operation({
      tag: 'Admin — Catálogo',
      summary: 'Edita categoria',
      params: [pathParam('categoryId', 'Identificador da categoria')],
      body: updateCategoryBody,
      success: { status: 200, schema: dataOf(ref('Category')), description: 'Atualizada' },
      errors: { 404: 'Categoria não encontrada', 409: 'Categoria já existe' },
    }),
    delete: operation({
      tag: 'Admin — Catálogo',
      summary: 'Remove categoria sem cupcakes vinculados',
      params: [pathParam('categoryId', 'Identificador da categoria')],
      success: { status: 204, description: 'Removida' },
      errors: { 404: 'Categoria não encontrada', 409: 'Categoria em uso' },
    }),
  },
  '/api/v1/admin/dietary-tags': {
    get: operation({
      tag: 'Admin — Catálogo',
      summary: 'Lista restrições alimentares',
      success: {
        status: 200,
        schema: dataOf(arrayOf(ref('DietaryTag'))),
        description: 'Restrições',
      },
    }),
    post: operation({
      tag: 'Admin — Catálogo',
      summary: 'Cria restrição alimentar',
      body: dietaryTagBody,
      success: { status: 201, schema: dataOf(ref('DietaryTag')), description: 'Criada' },
      errors: { 409: 'Restrição já existe' },
    }),
  },
  '/api/v1/admin/dietary-tags/{dietaryTagId}': {
    patch: operation({
      tag: 'Admin — Catálogo',
      summary: 'Renomeia restrição alimentar',
      params: [pathParam('dietaryTagId', 'Identificador da restrição')],
      body: dietaryTagBody,
      success: { status: 200, schema: dataOf(ref('DietaryTag')), description: 'Atualizada' },
      errors: { 404: 'Restrição não encontrada', 409: 'Restrição já existe' },
    }),
    delete: operation({
      tag: 'Admin — Catálogo',
      summary: 'Remove restrição alimentar',
      params: [pathParam('dietaryTagId', 'Identificador da restrição')],
      success: { status: 204, description: 'Removida' },
      errors: { 404: 'Restrição não encontrada' },
    }),
  },
  '/api/v1/admin/stock': {
    get: operation({
      tag: 'Admin — Estoque',
      summary: 'Estoque do dia com alertas',
      query: stockDateQuery,
      success: { status: 200, schema: dataOf(ref('StockOverview')), description: 'Estoque' },
    }),
    put: operation({
      tag: 'Admin — Estoque',
      summary: 'Define quantidades em lote (atômico)',
      body: setStockBody,
      success: {
        status: 200,
        schema: dataOf(ref('StockOverview')),
        description: 'Estoque atualizado',
      },
      errors: { 422: 'Cupcake inexistente ou data passada' },
    }),
  },
  '/api/v1/admin/stock/alerts': {
    get: operation({
      tag: 'Admin — Estoque',
      summary: 'Cupcakes com estoque baixo ou esgotados',
      query: stockDateQuery,
      success: { status: 200, schema: dataOf(ref('StockOverview')), description: 'Alertas' },
    }),
  },
  '/api/v1/admin/stock/{cupcakeId}': {
    put: operation({
      tag: 'Admin — Estoque',
      summary: 'Define a quantidade de um cupcake (0 zera)',
      params: [cupcakeId],
      body: setSingleStockBody,
      success: {
        status: 200,
        schema: dataOf(ref('StockOverview')),
        description: 'Estoque atualizado',
      },
      errors: { 422: 'Cupcake inexistente ou data passada' },
    }),
  },
  '/api/v1/admin/orders': {
    get: operation({
      tag: 'Admin — Pedidos',
      summary: 'Lista todos os pedidos',
      query: listAdminOrdersQuery,
      success: { status: 200, schema: pageOf(ref('OrderSummary')), description: 'Pedidos' },
    }),
  },
  '/api/v1/admin/orders/{orderId}': {
    get: operation({
      tag: 'Admin — Pedidos',
      summary: 'Detalha qualquer pedido',
      params: [orderId],
      success: { status: 200, schema: dataOf(ref('OrderDetail')), description: 'Pedido' },
      errors: { 404: 'Pedido não encontrado' },
    }),
  },
  '/api/v1/admin/orders/{orderId}/cancel': {
    post: operation({
      tag: 'Admin — Pedidos',
      summary: 'Cancela pedido (reembolsa se pago)',
      params: [orderId],
      body: adminCancelOrderBody,
      success: { status: 200, schema: dataOf(ref('OrderDetail')), description: 'Pedido cancelado' },
      errors: { 404: 'Pedido não encontrado', 409: 'Pedido já finalizado' },
    }),
  },
  '/api/v1/admin/dashboard': {
    get: operation({
      tag: 'Admin — Dashboard',
      summary: 'Faturamento e pedidos do período',
      query: dashboardQuery,
      success: { status: 200, schema: dataOf(ref('Dashboard')), description: 'Indicadores' },
    }),
  },
  '/api/v1/admin/users': {
    get: operation({
      tag: 'Admin — Usuários',
      summary: 'Lista usuários',
      query: listUsersQuery,
      success: { status: 200, schema: pageOf(ref('AdminUser')), description: 'Usuários' },
    }),
  },
  '/api/v1/admin/users/{userId}': {
    get: operation({
      tag: 'Admin — Usuários',
      summary: 'Detalha usuário',
      params: [pathParam('userId', 'Identificador do usuário')],
      success: { status: 200, schema: dataOf(ref('AdminUser')), description: 'Usuário' },
      errors: { 404: 'Usuário não encontrado' },
    }),
  },
  '/api/v1/admin/users/{userId}/role': {
    patch: operation({
      tag: 'Admin — Usuários',
      summary: 'Altera o papel do usuário',
      params: [pathParam('userId', 'Identificador do usuário')],
      body: changeRoleBody,
      success: { status: 200, schema: dataOf(ref('AdminUser')), description: 'Papel alterado' },
      errors: {
        404: 'Usuário não encontrado',
        422: 'Próprio papel, último admin ou conta encerrada',
      },
    }),
  },
};

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Cupqy API',
    version: pkg.version,
    description:
      'API REST do Cupqy — e-commerce de cupcakes. Autenticação via Supabase Auth: envie o ' +
      'access token no cabeçalho `Authorization: Bearer <token>`. Valores monetários em centavos.',
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [
    'Infraestrutura',
    'Perfil',
    'Catálogo',
    'Loja e frete',
    'Carrinho',
    'Pedidos',
    'Pagamentos',
    'Cozinha',
    'Admin — Catálogo',
    'Admin — Estoque',
    'Admin — Pedidos',
    'Admin — Dashboard',
    'Admin — Usuários',
  ].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token emitido pelo Supabase Auth',
      },
    },
    schemas,
  },
  paths,
};

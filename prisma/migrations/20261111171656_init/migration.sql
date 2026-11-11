-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'BAKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'IN_PREPARATION', 'AWAITING_COURIER', 'OUT_FOR_DELIVERY', 'AWAITING_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('CUSTOMER_REQUEST', 'PAYMENT_EXPIRED', 'PAYMENT_SETUP_FAILED', 'OUT_OF_STOCK', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_REFUNDED', 'ADMIN_REQUEST');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADO_PAGO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'IN_PROCESS', 'AUTHORIZED', 'APPROVED', 'IN_MEDIATION', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "full_name" VARCHAR(120),
    "phone" VARCHAR(20),
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(40),
    "zip_code" CHAR(8) NOT NULL,
    "street" VARCHAR(150) NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "complement" VARCHAR(100),
    "neighborhood" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "slug" VARCHAR(70) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "slug" VARCHAR(70) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dietary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupcakes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "flavor" VARCHAR(60) NOT NULL,
    "ingredients" VARCHAR(1000) NOT NULL,
    "weight_grams" INTEGER,
    "size" VARCHAR(60),
    "nutritional_info" JSONB,
    "price_cents" INTEGER NOT NULL,
    "image_path" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(3),
    "category_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cupcakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupcake_dietary_tags" (
    "cupcake_id" UUID NOT NULL,
    "dietary_tag_id" UUID NOT NULL,

    CONSTRAINT "cupcake_dietary_tags_pkey" PRIMARY KEY ("cupcake_id","dietary_tag_id")
);

-- CreateTable
CREATE TABLE "daily_stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cupcake_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "fulfillment_type" "FulfillmentType" NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "delivery_address" JSONB,
    "delivery_distance_km" DOUBLE PRECISION,
    "estimated_minutes" INTEGER,
    "save_address" BOOLEAN NOT NULL DEFAULT false,
    "courier_name" VARCHAR(120),
    "stock_date" DATE,
    "mp_preference_id" VARCHAR(100),
    "payment_expires_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" "CancellationReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "cupcake_id" UUID NOT NULL,
    "cupcake_name" VARCHAR(100) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MERCADO_PAGO',
    "provider_payment_id" VARCHAR(64) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "status_detail" VARCHAR(100),
    "payment_method_id" VARCHAR(50),
    "payment_type_id" VARCHAR(50),
    "amount_cents" INTEGER NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NONE',
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_id" UUID,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "profiles_email_idx" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_tags_name_key" ON "dietary_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_tags_slug_key" ON "dietary_tags"("slug");

-- CreateIndex
CREATE INDEX "cupcakes_is_active_deleted_at_idx" ON "cupcakes"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "cupcakes_category_id_idx" ON "cupcakes"("category_id");

-- CreateIndex
CREATE INDEX "cupcakes_name_idx" ON "cupcakes"("name");

-- CreateIndex
CREATE INDEX "cupcakes_flavor_idx" ON "cupcakes"("flavor");

-- CreateIndex
CREATE INDEX "cupcake_dietary_tags_dietary_tag_id_idx" ON "cupcake_dietary_tags"("dietary_tag_id");

-- CreateIndex
CREATE INDEX "daily_stock_date_idx" ON "daily_stock"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stock_cupcake_id_date_key" ON "daily_stock"("cupcake_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_paid_at_idx" ON "orders"("status", "paid_at");

-- CreateIndex
CREATE INDEX "orders_status_completed_at_idx" ON "orders"("status", "completed_at");

-- CreateIndex
CREATE INDEX "orders_status_payment_expires_at_idx" ON "orders"("status", "payment_expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_cupcake_id_idx" ON "order_items"("cupcake_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupcakes" ADD CONSTRAINT "cupcakes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupcake_dietary_tags" ADD CONSTRAINT "cupcake_dietary_tags_cupcake_id_fkey" FOREIGN KEY ("cupcake_id") REFERENCES "cupcakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupcake_dietary_tags" ADD CONSTRAINT "cupcake_dietary_tags_dietary_tag_id_fkey" FOREIGN KEY ("dietary_tag_id") REFERENCES "dietary_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stock" ADD CONSTRAINT "daily_stock_cupcake_id_fkey" FOREIGN KEY ("cupcake_id") REFERENCES "cupcakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cupcake_id_fkey" FOREIGN KEY ("cupcake_id") REFERENCES "cupcakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Regras adicionais (não expressáveis no schema do Prisma)
-- =============================================================================

-- Integridade de valores -------------------------------------------------------
ALTER TABLE "cupcakes"
  ADD CONSTRAINT "cupcakes_price_positive" CHECK ("price_cents" > 0),
  ADD CONSTRAINT "cupcakes_weight_positive" CHECK ("weight_grams" IS NULL OR "weight_grams" > 0);

ALTER TABLE "daily_stock"
  ADD CONSTRAINT "daily_stock_quantity_non_negative" CHECK ("quantity" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_unit_price_positive" CHECK ("unit_price_cents" > 0),
  ADD CONSTRAINT "order_items_subtotal_consistent" CHECK ("subtotal_cents" = "unit_price_cents" * "quantity");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_subtotal_non_negative" CHECK ("subtotal_cents" >= 0),
  ADD CONSTRAINT "orders_delivery_fee_non_negative" CHECK ("delivery_fee_cents" >= 0),
  ADD CONSTRAINT "orders_total_consistent" CHECK ("total_cents" = "subtotal_cents" + "delivery_fee_cents"),
  ADD CONSTRAINT "orders_pickup_without_fee" CHECK ("fulfillment_type" <> 'PICKUP' OR "delivery_fee_cents" = 0),
  ADD CONSTRAINT "orders_delivery_has_address" CHECK ("fulfillment_type" <> 'DELIVERY' OR "delivery_address" IS NOT NULL);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount_cents" >= 0);

ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_zip_code_format" CHECK ("zip_code" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "addresses_state_format" CHECK ("state" ~ '^[A-Z]{2}$');

-- Apenas um endereço padrão por usuário.
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" ("user_id") WHERE "is_default";

-- Número do pedido amigável a partir de 1001 ------------------------------------
ALTER SEQUENCE "orders_order_number_seq" START WITH 1001 RESTART WITH 1001;

-- Row Level Security -------------------------------------------------------------
-- O Supabase expõe o schema "public" via API REST (PostgREST) para as chaves anon/authenticated.
-- Com RLS habilitado e sem políticas, esse acesso direto é NEGADO por padrão.
-- A API (Prisma) conecta como dono das tabelas e não é afetada.
-- Políticas de leitura específicas para o Supabase Realtime ficam em supabase/sql/.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dietary_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cupcakes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cupcake_dietary_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;

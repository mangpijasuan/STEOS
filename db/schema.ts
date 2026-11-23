// Typed mirror of db/migrations. The SQL migrations are the source of truth
// (constraints, row-level security and composite keys live there).
import { boolean, integer, jsonb, pgTable, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Chicago"),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  stripeAccountId: text("stripe_account_id"),
  status: text("status").notNull().default("pilot"),
  minPrepMinutes: integer("min_prep_minutes").notNull().default(20),
  maxAdvanceDays: integer("max_advance_days").notNull().default(2),
  acceptingOrders: boolean("accepting_orders").notNull().default(true),
  dineInEnabled: boolean("dine_in_enabled").notNull().default(false),
  payLaterEnabled: boolean("pay_later_enabled").notNull().default(true),
  nextOrderNumber: integer("next_order_number").notNull().default(1),
  platformFeeBps: integer("platform_fee_bps").notNull().default(600),
  feeModel: text("fee_model").notNull().default("all_in"),
  pricingPlan: text("pricing_plan").notNull().default("model_b"),
  pricingPlanChangedAt: timestamp("pricing_plan_changed_at", { withTimezone: true }),
  ...timestamps,
});

export const businessHours = pgTable("business_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  locationId: uuid("location_id").notNull(),
  weekday: smallint("weekday").notNull(),
  opens: time("opens").notNull(),
  closes: time("closes").notNull(),
  ...timestamps,
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  name: text("name").notNull(),
  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  timezone: text("timezone"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  categoryId: uuid("category_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  available: boolean("available").notNull().default(true),
  imageUrl: text("image_url"),
  imageId: uuid("image_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  itemId: uuid("item_id").notNull(),
  name: text("name").notNull(),
  minChoices: integer("min_choices").notNull().default(0),
  maxChoices: integer("max_choices").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  groupId: uuid("group_id").notNull(),
  name: text("name").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  locationId: uuid("location_id"),
  number: integer("number").notNull(),
  status: text("status").notNull().default("pending_payment"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  pickupType: text("pickup_type").notNull(),
  pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  tipCents: integer("tip_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  feeSnapshot: jsonb("fee_snapshot").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint"),
  providerAccountId: text("provider_account_id"),
  expiryRetryAt: timestamp("expiry_retry_at", { withTimezone: true }),
  publicTokenHash: text("public_token_hash").notNull(),
  acceptDeadline: timestamp("accept_deadline", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  prepMinutes: integer("prep_minutes"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  orderType: text("order_type").notNull().default("pickup"),
  tableId: uuid("table_id"),
  paymentMode: text("payment_mode").notNull().default("online"),
  feeCollection: text("fee_collection").notNull().default("platform"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  servedAt: timestamp("served_at", { withTimezone: true }),
  discountCents: integer("discount_cents").notNull().default(0),
  promoCode: text("promo_code"),
  promoId: uuid("promo_id"),
  createdBy: uuid("created_by"),
  ...timestamps,
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  orderId: uuid("order_id").notNull(),
  itemId: uuid("item_id"),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
  options: jsonb("options").notNull().default([]),
  note: text("note"),
  lineTotalCents: integer("line_total_cents").notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id").notNull(),
  clientSecret: text("client_secret"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundId: text("refund_id"),
  refundCheckedAt: timestamp("refund_checked_at", { withTimezone: true }),
  refundAttempt: integer("refund_attempt").notNull().default(0),
  refundStatus: text("refund_status"),
  status: text("status").notNull().default("requires_payment"),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  method: text("method").notNull().default("card_online"),
  ...timestamps,
});

export const providerIntegrations = pgTable("provider_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  provider: text("provider").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  status: text("status").notNull().default("pending"),
  ...timestamps,
});
export const floors = pgTable("floors", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const diningTables = pgTable("dining_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  floorId: uuid("floor_id"),
  label: text("label").notNull(),
  seats: integer("seats").notNull().default(4),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  qrToken: text("qr_token").notNull(),
  assignedTo: uuid("assigned_to"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  clearedAt: timestamp("cleared_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export const tableRequests = pgTable("table_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  tableId: uuid("table_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull(),
  code: text("code").notNull(),
  kind: text("kind").notNull(),
  value: integer("value").notNull(),
  minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  ...timestamps,
});

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
  nextOrderNumber: integer("next_order_number").notNull().default(1),
  platformFeeBps: integer("platform_fee_bps").notNull().default(600),
  feeModel: text("fee_model").notNull().default("all_in"),
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
  publicTokenHash: text("public_token_hash").notNull(),
  acceptDeadline: timestamp("accept_deadline", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  prepMinutes: integer("prep_minutes"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
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
  status: text("status").notNull().default("requires_payment"),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
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

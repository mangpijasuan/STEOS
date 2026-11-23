import { z } from "zod";

const sortOrder = z.number().int().min(0).max(10000);
const name = (max: number) => z.string().trim().min(1).max(max);

export const categoryInput = z.object({ name: name(80), sortOrder: sortOrder.optional() });
export const categoryUpdate = categoryInput.partial();

export const itemInput = z.object({
  categoryId: z.uuid(),
  name: name(120),
  description: z.string().trim().max(1000).optional(),
  priceCents: z.number().int().min(0).max(1_000_000),
  available: z.boolean().optional(),
  imageUrl: z.url().max(500).nullable().optional(),
  imageId: z.uuid().nullable().optional(),
  sortOrder: sortOrder.optional(),
});
export const itemUpdate = itemInput.partial();

export const availabilityInput = z.object({ available: z.boolean() });

export const groupInput = z
  .object({
    name: name(80),
    minChoices: z.number().int().min(0).max(20).default(0),
    maxChoices: z.number().int().min(1).max(20).default(1),
    sortOrder: sortOrder.optional(),
  })
  .refine((g) => g.maxChoices >= g.minChoices, { message: "maxChoices must be at least minChoices" });
export const groupUpdate = z.object({
  name: name(80).optional(),
  minChoices: z.number().int().min(0).max(20).optional(),
  maxChoices: z.number().int().min(1).max(20).optional(),
  sortOrder: sortOrder.optional(),
});

export const optionInput = z.object({
  name: name(80),
  priceDeltaCents: z.number().int().min(0).max(100_000).default(0),
  available: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});
export const optionUpdate = optionInput.partial();

export const loginRequest = z.object({ email: z.email().max(254) });

export const cartLine = z.object({
  itemId: z.uuid(),
  quantity: z.number().int().min(1).max(50),
  optionIds: z.array(z.uuid()).max(30).default([]),
  note: z.string().trim().max(200).optional(),
});

export const quoteInput = z.object({
  items: z.array(cartLine).min(1).max(50),
  tipCents: z.number().int().min(0).max(100_000).default(0),
  pickupTime: z.iso.datetime().optional(),
});

export const settingsUpdate = z.object({
  acceptingOrders: z.boolean().optional(),
  minPrepMinutes: z.number().int().min(5).max(240).optional(),
  maxAdvanceDays: z.number().int().min(0).max(14).optional(),
  taxRateBps: z.number().int().min(0).max(3000).optional(),
  dineInEnabled: z.boolean().optional(),
  payLaterEnabled: z.boolean().optional(),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const hoursInput = z.object({
  periods: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), opens: hhmm, closes: hhmm }))
    .max(28),
});

export const checkoutInput = quoteInput.extend({
  customer: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().regex(/^[0-9+()\-\s.]{7,25}$/, "Enter a valid phone number"),
  }),
});

// ------------------------------------------------------------------ dine-in
export const floorInput = z.object({ name: name(40) });
export const floorUpdate = z.object({ name: name(40).optional(), sortOrder: sortOrder.optional() });

const tableLabel = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/, "Use letters, numbers, spaces or dashes");
export const tablesCreate = z.object({
  labels: z.array(tableLabel).min(1).max(100),
  floorId: z.uuid().nullable().default(null),
  seats: z.number().int().min(1).max(50).default(4),
});
export const tableUpdate = z.object({
  label: tableLabel.optional(),
  seats: z.number().int().min(1).max(50).optional(),
  floorId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
  assignedTo: z.uuid().nullable().optional(),
});

export const requestInput = z.object({ kind: z.enum(["waiter", "bill_cash", "bill_card", "water", "other"]) });
export const payInput = z.object({ method: z.enum(["cash", "card_terminal", "other"]) });

/** Seated guests: a name and phone are optional (the table says who they are). */
export const dineInCheckoutInput = z.object({
  items: z.array(cartLine).min(1).max(50),
  tipCents: z.number().int().min(0).max(100_000).default(0),
  payLater: z.boolean(),
  customer: z
    .object({
      name: z.string().trim().max(80).default(""),
      phone: z
        .string()
        .trim()
        .max(25)
        .refine((v) => v === "" || /^[0-9+()\-\s.]{7,25}$/.test(v), "Enter a valid phone number")
        .default(""),
    })
    .default({ name: "", phone: "" }),
});

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

const editorGroup = z.object({
  id: z.uuid(),
  name: name(80),
  minChoices: z.number().int().min(0).max(20),
  maxChoices: z.number().int().min(1).max(20),
  options: z.array(optionInput.extend({ id: z.uuid() })).min(1),
}).refine((g) => g.maxChoices >= g.minChoices, { message: "Maximum choices must be at least the minimum" });

export const menuItemEditorInput = z.object({
  createIfMissing: z.boolean(),
  item: itemInput,
  groups: z.array(editorGroup),
}).refine(({ groups }) => {
  const groupIds = groups.map((g) => g.id);
  const optionIds = groups.flatMap((g) => g.options.map((o) => o.id));
  return new Set(groupIds).size === groupIds.length && new Set(optionIds).size === optionIds.length;
}, { message: "Duplicate add-on group or option" });

export type MenuItemEditorInput = z.infer<typeof menuItemEditorInput>;

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

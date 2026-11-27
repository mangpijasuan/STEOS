import { z } from "zod";
import { posInput } from "./validation";

// Drafts deliberately do not accept card, payment, price or kitchen state.
export const heldPayloadSchema = posInput.omit({ payment: true, customerPhone: true, tipCents: true }).strict();
export type HeldPayload = z.infer<typeof heldPayloadSchema>;
export const heldClaimSchema = z.object({ id: z.uuid(), claimId: z.uuid(), version: z.number().int().positive() }).strict();
export type HeldClaim = z.infer<typeof heldClaimSchema>;
export const createHeldSchema = z.object({ id: z.uuid(), payload: heldPayloadSchema }).strict();
export const heldActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), version: z.number().int().positive(), claimId: z.uuid(), recover: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("rehold"), version: z.number().int().positive(), claimId: z.uuid(), payload: heldPayloadSchema }).strict(),
  z.object({ action: z.literal("cancel"), version: z.number().int().positive(), claimId: z.uuid().optional() }).strict(),
]);
export type HeldAction = z.infer<typeof heldActionSchema>;
export type HeldSummary = { id: string; status: "held" | "claimed"; version: number; updatedAt: string; itemCount: number; orderType: "counter" | "dine_in" };

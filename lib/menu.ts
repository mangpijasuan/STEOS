import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { menuCategories, menuItems, modifierGroups, modifierOptions } from "../db/schema";
import type { Tx } from "./db";
import { HttpError } from "./http";
import type { MenuItemEditorInput } from "./validation";

type Patch = Record<string, unknown>;

/** Drops undefined keys so partial updates never overwrite fields with undefined. */
function clean<T extends Patch>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function mustChange(patch: Patch) {
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update");
}

function found<T>(rows: T[]): T {
  if (!rows[0]) throw new HttpError(404, "Not found");
  return rows[0];
}

/** Maps Postgres foreign-key failures to friendly errors. */
function friendly(error: unknown, message: string): never {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23503") throw new HttpError(409, message);
  throw error;
}

// ------------------------------------------------------------------ read
export async function getMenu(db: Tx) {
  const categories = await db.select().from(menuCategories).where(isNull(menuCategories.deletedAt)).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  const items = await db
    .select()
    .from(menuItems)
    .where(isNull(menuItems.deletedAt))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
  const groups = await db.select().from(modifierGroups).orderBy(asc(modifierGroups.sortOrder));
  const options = await db.select().from(modifierOptions).orderBy(asc(modifierOptions.sortOrder));

  return categories.map((category) => ({
    ...category,
    items: items
      .filter((item) => item.categoryId === category.id)
      .map((item) => ({
        ...item,
        modifierGroups: groups
          .filter((group) => group.itemId === item.id)
          .map((group) => ({ ...group, options: options.filter((option) => option.groupId === group.id) })),
      })),
  }));
}

// ------------------------------------------------------------ categories
export async function createCategory(db: Tx, restaurantId: string, input: { name: string; sortOrder?: number }) {
  return found(await db.insert(menuCategories).values({ restaurantId, ...clean(input) } as typeof menuCategories.$inferInsert).returning());
}

export async function updateCategory(db: Tx, id: string, input: Patch) {
  const patch = clean(input);
  mustChange(patch);
  return found(await db.update(menuCategories).set(patch).where(and(eq(menuCategories.id, id), isNull(menuCategories.deletedAt))).returning());
}

export async function deleteCategory(db: Tx, id: string) {
  await requireActiveCategory(db, id);
  const [item] = await db.select({ id: menuItems.id }).from(menuItems)
    .where(and(eq(menuItems.categoryId, id), isNull(menuItems.deletedAt))).limit(1);
  if (item) throw new HttpError(409, "Remove or move this category's items first");
  await db.update(menuCategories).set({ deletedAt: new Date() }).where(eq(menuCategories.id, id));
}

async function requireActiveCategory(db: Tx, id: string, missingStatus = 404) {
  const [category] = await db.select({ id: menuCategories.id }).from(menuCategories)
    .where(and(eq(menuCategories.id, id), isNull(menuCategories.deletedAt))).for("update");
  if (!category) throw new HttpError(missingStatus, "Category not found");
}

// ----------------------------------------------------------------- items
export async function createItem(db: Tx, restaurantId: string, input: Patch) {
  await requireActiveCategory(db, String(input.categoryId), 409);
  try {
    return found(await db.insert(menuItems).values({ restaurantId, ...clean(input) } as typeof menuItems.$inferInsert).returning());
  } catch (error) {
    friendly(error, "Category not found");
  }
}

export async function updateItem(db: Tx, id: string, input: Patch) {
  const patch = clean(input);
  mustChange(patch);
  if (typeof patch.categoryId === "string") await requireActiveCategory(db, patch.categoryId, 409);
  try {
    const [before] = "imageId" in patch
      ? await db.select({ imageId: menuItems.imageId }).from(menuItems).where(eq(menuItems.id, id)).for("update")
      : [];
    const updated = found(
      await db
        .update(menuItems)
        .set(patch)
        .where(and(eq(menuItems.id, id), isNull(menuItems.deletedAt)))
        .returning(),
    );
    if (before?.imageId && before.imageId !== updated.imageId) {
      await db.execute(sql`select remove_unused_menu_image(${before.imageId})`);
    }
    return updated;
  } catch (error) {
    friendly(error, "Category or photo not found");
  }
}

/** Saves the editor's item and add-ons in the caller's tenant transaction. */
export async function saveMenuItemEditor(db: Tx, restaurantId: string, itemId: string, input: MenuItemEditorInput) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"menu-editor:" + itemId}, 0))`);
  const [existing] = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, itemId));
  let item: typeof menuItems.$inferSelect;
  if (!existing && input.createIfMissing) {
    await requireActiveCategory(db, input.item.categoryId, 409);
    try {
      const [created] = await db.insert(menuItems).values({ ...input.item, id: itemId, restaurantId })
        .onConflictDoNothing({ target: menuItems.id }).returning();
      if (!created) throw new HttpError(409, "Item is unavailable");
      item = created;
    } catch (error) {
      friendly(error, "Category or photo not found");
    }
  } else {
    item = await updateItem(db, itemId, input.item);
  }

  const savedGroups = await db.select({ id: modifierGroups.id }).from(modifierGroups)
    .where(eq(modifierGroups.itemId, itemId));
  const savedGroupIds = new Set(savedGroups.map((group) => group.id));
  const draftGroupIds = new Set(input.groups.map((group) => group.id));

  for (const [sortOrder, group] of input.groups.entries()) {
    const { id, options, ...fields } = group;
    if (savedGroupIds.has(id)) {
      await updateGroup(db, id, { ...fields, sortOrder });
    } else {
      const [created] = await db.insert(modifierGroups).values({ ...fields, id, itemId, restaurantId, sortOrder })
        .onConflictDoNothing({ target: modifierGroups.id }).returning({ id: modifierGroups.id });
      if (!created) throw new HttpError(409, "Add-on group is unavailable");
    }

    const savedOptions = await db.select({ id: modifierOptions.id }).from(modifierOptions)
      .where(eq(modifierOptions.groupId, id));
    const savedOptionIds = new Set(savedOptions.map((option) => option.id));
    const draftOptionIds = new Set(options.map((option) => option.id));
    for (const [position, option] of options.entries()) {
      if (savedOptionIds.has(option.id)) {
        await updateOption(db, option.id, { name: option.name, priceDeltaCents: option.priceDeltaCents, available: option.available, sortOrder: position });
      } else {
        const [created] = await db.insert(modifierOptions).values({ ...option, groupId: id, restaurantId, sortOrder: position })
          .onConflictDoNothing({ target: modifierOptions.id }).returning({ id: modifierOptions.id });
        if (!created) throw new HttpError(409, "Add-on option is unavailable");
      }
    }
    for (const option of savedOptions) {
      if (!draftOptionIds.has(option.id)) await deleteOption(db, option.id);
    }
  }
  for (const group of savedGroups) {
    if (!draftGroupIds.has(group.id)) await deleteGroup(db, group.id);
  }
  return item;
}

/** Soft delete: past orders keep pointing at the item. */
export async function deleteItem(db: Tx, id: string) {
  found(
    await db
      .update(menuItems)
      .set({ deletedAt: new Date(), available: false })
      .where(and(eq(menuItems.id, id), isNull(menuItems.deletedAt)))
      .returning({ id: menuItems.id }),
  );
}

export async function setItemAvailability(db: Tx, id: string, available: boolean) {
  return found(
    await db
      .update(menuItems)
      .set({ available })
      .where(and(eq(menuItems.id, id), isNull(menuItems.deletedAt)))
      .returning({ id: menuItems.id, available: menuItems.available }),
  );
}

// ------------------------------------------------------ modifier groups
export async function createGroup(db: Tx, restaurantId: string, itemId: string, input: Patch) {
  try {
    return found(
      await db.insert(modifierGroups).values({ restaurantId, itemId, ...clean(input) } as typeof modifierGroups.$inferInsert).returning(),
    );
  } catch (error) {
    friendly(error, "Item not found");
  }
}

export async function updateGroup(db: Tx, id: string, input: Patch) {
  const patch = clean(input);
  mustChange(patch);
  try {
    return found(await db.update(modifierGroups).set(patch).where(eq(modifierGroups.id, id)).returning());
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23514") {
      throw new HttpError(400, "maxChoices must be at least minChoices");
    }
    throw error;
  }
}

export async function deleteGroup(db: Tx, id: string) {
  found(await db.delete(modifierGroups).where(eq(modifierGroups.id, id)).returning({ id: modifierGroups.id }));
}

// ------------------------------------------------------ modifier options
export async function createOption(db: Tx, restaurantId: string, groupId: string, input: Patch) {
  try {
    return found(
      await db.insert(modifierOptions).values({ restaurantId, groupId, ...clean(input) } as typeof modifierOptions.$inferInsert).returning(),
    );
  } catch (error) {
    friendly(error, "Modifier group not found");
  }
}

export async function updateOption(db: Tx, id: string, input: Patch) {
  const patch = clean(input);
  mustChange(patch);
  return found(await db.update(modifierOptions).set(patch).where(eq(modifierOptions.id, id)).returning());
}

export async function deleteOption(db: Tx, id: string) {
  found(await db.delete(modifierOptions).where(eq(modifierOptions.id, id)).returning({ id: modifierOptions.id }));
}

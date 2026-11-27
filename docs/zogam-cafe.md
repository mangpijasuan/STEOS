# Zogam Cafe menu pilot

Zogam Cafe's storefront is at `/r/zogam-cafe`. A separate cafe website can link its **View Menu** and **Order Pickup** buttons to this page. Both customers and the kitchen then use the menu maintained in STEOS.

## Set up the pilot

Run the import on a staging database with the image and menu migrations applied. Use the cafe owner's confirmed sign-in address. Each staff email in STEOS is currently tied to one restaurant.

```sh
npm run db:migrate
ZOGAM_OWNER_EMAIL=owner@example.com npm run db:seed:zogam
```

The importer creates the restaurant and its owner in a single transaction. It starts with ordering paused and exits without updating the menu if the slug already exists.

To include photos on first import, set `ZOGAM_PHOTO_DIR` to a folder of JPEGs approved by the cafe. Use the lowercase dish name with punctuation and spaces replaced by hyphens, for example `pad-thai.jpg` or `chicken-satay-5-pc.jpg`. Each file can be up to 1.5 MB. Dishes without a matching file are imported without a photo. For an existing menu, add photos in `/menu`.

## Edit the menu and photos

Sign in through `/login` with the owner's email, then open `/menu`. Select a category and dish, update its name, description, price or choices, and save. Use the dish's photo control to add or replace its picture. Saved changes appear in the storefront and in `GET /api/r/zogam-cafe/menu`.

The pilot transcribes the six provided menu pages. Printed protein surcharges, hot pot sizes, and curry and sauce choices use the existing STEOS choice editor. The printed “Add Order” entries are separate products in **Sides & Extras**. Verify the printed pickup prices, choices, ingredient descriptions, and availability with the cafe. Confirm opening hours and tax in `/manage` and test pickup checkout before opening ordering.

## Items awaiting price confirmation

The following descriptions are ready for the owner to add in `/menu` once the cafe confirms how to price the items.

| Category | Item | Description | Price to confirm |
| :--- | :--- | :--- | :--- |
| Salads | Yum Beef, Chicken or Seafood | Thai salad with your choice of protein, onions, cucumber, celery and lime juice. | The page shows $12.95 and $15.95. Confirm which protein goes with each price. |
| Noodles | Singapore Fried Noodle | Stir-fried rice noodles with chicken, shrimp and vegetables in curry sauce, topped with sesame seeds. | Confirm the price for the chicken-and-shrimp preparation. |
| Fried Rice | Nasi Lemak | Coconut rice with sambal, crispy fried anchovies, peanuts and cucumber slices. | The supplied page has no price for this dish. |
| Seafood Specials | Red Snapper | Deep-fried whole red snapper with spicy Thai sweet-and-sour chili sauce. Served with jasmine rice. | Market price. |
| Seafood Specials | Lemon Fish | Steamed whole fish with fresh chili, garlic and lemon. Served with jasmine rice. | Market price. |

Pepper Steak is imported at the printed beef price. Confirm whether other protein choices are offered.

Zogam Cafe's storefront look (green palette, logo badge, tagline, favorite dishes and menu search) is stored as branding data on the restaurant, not in code. The importer sets it for new databases, and migration `0015` applied it to existing ones. See [ARCHITECTURE.md](ARCHITECTURE.md). The owner can change its colors, tagline, search and favorites in Hours & settings; the logo stays as set.

## Batch import of the original menu photos

The extraction script has 50 crop rectangles for the six supplied 1275 × 1650 menu pages. Install ImageMagick 7 locally, place the original menu pages in a private folder, and provide paths in this exact category order (rename copies if necessary):

```sh
node scripts/crop-zogam-photos.mjs zogam-crops seafood.jpeg entrees.jpeg rice.jpeg noodles.jpeg soups.jpeg appetizers.jpeg
```

The output directory must be new. The photos are taken from the original pages, lightly sharpened and stripped of metadata; they are not AI-generated substitutes. Inspect every image before upload, particularly the soup/salad crops where printed labels have been excluded. Verify the cafe has permission to use these photographs online. Five photos correspond to dishes currently awaiting price confirmation.

For the existing staging restaurant, set `DATABASE_OWNER_URL` securely in the shell and set `ZOGAM_PHOTO_DIR` to the reviewed crop directory (mount it read-only into the container when running there). Preview the operation first:

```sh
npx tsx scripts/import-zogam-photos.ts
```

After checking every ADD/KEEP/SKIP line, run the same command with `--apply`. To deliberately replace existing images, preview with `--replace-existing`, then run with both flags. The default keeps existing photographs. The script matches exact dish/category names within Zogam Cafe only, does not create missing items, and does not change prices, branding, or ordering availability. It rolls back the batch on failure. Back up staging before applying.

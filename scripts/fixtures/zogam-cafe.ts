type Option = readonly [name: string, priceDeltaCents: number];
type Choice = readonly [name: string, options: readonly Option[]];
type Item = readonly [
  name: string,
  description: string,
  priceCents: number | null,
  choices?: readonly Choice[],
  ownerReview?: string,
];

const protein = (beef: number, combo: number, seafood: number): Choice => [
  "Protein",
  [
    ["Pork", 0], ["Chicken", 0], ["Vegetables", 0], ["Tofu", 0],
    ["Beef", beef], ["Combo (chicken, pork, beef and shrimp)", combo], ["Seafood", seafood],
  ],
];
const standardProtein: Choice = [
  "Protein",
  [...protein(100, 200, 300)[1].slice(0, -1), ["Shrimp", 200], ["Seafood", 300]],
];
const entreeProtein = protein(100, 100, 200);
const curryProtein = protein(100, 200, 300);

export const zogamMenu: Record<string, readonly Item[]> = {
  Appetizers: [
    ["Thai Spring Rolls (3 pc)", "Crisp spring rolls filled with clear noodles, carrots, celery and cabbage.", 495],
    ["Fresh Summer Rolls (2 pc)", "Fresh vegetables and shrimp wrapped in thin rice paper.", 495],
    ["Chicken Satay (5 pc)", "Grilled chicken skewers marinated in coconut milk and curry, served with peanut sauce and cucumber salad.", 795],
    ["Krab Rangoon (5 pc)", "Fried wontons filled with imitation crab, cream cheese and white onion.", 495],
    ["Calamari", "Golden-fried squid served with plum sauce.", 795],
    ["Thai Golden Shrimp (5 pc)", "Marinated shrimp wrapped in rice paper and fried, served with Thai sweet-and-sour chili sauce.", 595],
    ["Thai Chicken Wings (10 pc)", "Tempura-battered, deep-fried chicken wings.", 1495],
    ["Tod Mann (5 pc)", "Thai fish cakes with chopped herbs and vegetables, served with sweet sauce.", 695],
    ["Tofu Tood (8 pc)", "Golden-fried tofu served with sweet sauce.", 595],
    ["Mussels Clay Pot", "Green mussels on the half shell steamed with basil and lemongrass, served with chili sauce.", 795],
    ["Bangkok Chicken", "Thai-style chicken tempura with cashews, sesame seeds and sweet-and-sour sauce.", 895],
    ["Gyoza (5 pc)", "Pan-fried dumplings served with house sweet soy sauce.", 695],
    ["Walnut Shrimp", "Jumbo shrimp with a mayonnaise-style sauce and candied walnuts.", 695],
    ["Gai Lan", "Chinese broccoli and jumbo shrimp with bean paste and house sauce.", 495],
  ],
  Soups: [
    ["Tom Yum Gong", "Hot and sour shrimp soup with chili, lemongrass, makrut lime leaves and lime juice.", 695],
    ["Tom Yum Gai", "Hot and sour chicken soup with chili, lemongrass, makrut lime leaves and lime juice.", 595],
    ["Tom Kha Gai", "Spicy coconut milk soup with chicken, mushrooms and herbs.", 695],
    ["Chicken Rice Soup", "Rice soup with scallions and garlic oil.", 495],
    ["Thai Hot Pot", "Thai hot pot with a seafood combination.", 1295, [["Size", [["Medium", 0], ["Large", 600]]]]],
  ],
  Salads: [
    ["Papaya Salad", "Shredded green papaya, carrots and tomatoes tossed with lime juice, sugar, chili and fish sauce.", 795],
    ["Green Salad", "Crisp lettuce, cucumber and garden vegetables with house ginger dressing.", 495],
    ["Yum Beef, Chicken or Seafood", "Thai salad with your choice of protein, onions, cucumber, celery and lime juice.", null, undefined, "The printed menu lists $12.95 and $15.95. Confirm the price for each protein."],
    ["Tiger Cried Beef", "Northern Thai-style marinated grilled steak with vegetables and spicy house steak sauce.", 1895],
    ["Labb", "Ground meat tossed with Thai herbs, chili powder, toasted ground rice, lime juice and mint.", 1295, [["Protein", [["Chicken", 0], ["Pork", 0], ["Beef", 0]]]]],
    ["Nam Sod", "Ground pork with ginger, lime juice, onions, shallots and peanuts on a bed of lettuce.", 1295],
  ],
  Noodles: [
    ["Pad Thai", "Stir-fried rice noodles with egg, scallions, bean sprouts and house sauce.", 1095, [standardProtein]],
    ["Pad Se-ew", "Stir-fried flat rice noodles with egg, broccoli, black bean sauce, soy sauce, carrots and snow peas.", 1095, [standardProtein]],
    ["Pad Lad Na", "Flat rice noodles with Chinese broccoli, carrots and Thai gravy.", 1095, [standardProtein]],
    ["Pad Kee Mao Noodle", "Basil-fried flat rice noodles with egg, onions, carrots, broccoli and red and green bell peppers.", 1095, [standardProtein]],
    ["Mi Goreng", "Stir-fried ramen with egg, bean sprouts, carrots, napa cabbage, scallions and house sauce.", 1095, [standardProtein]],
    ["Ciimnuai", "Stir-fried ramen noodles in a ginger soy sauce.", 1095, [standardProtein]],
    ["Egg Noodle", "Stir-fried egg noodles with egg, Chinese broccoli, carrots and onions.", 1095, [standardProtein]],
    ["Pad Woon Sen", "Stir-fried clear noodles with egg and mixed vegetables.", 1095, [standardProtein]],
    ["Kuay Tiew Kua Kai", "Stir-fried flat rice noodles with carrots, onions, broccoli, snow peas and egg.", 1095, [standardProtein]],
    ["Singapore Fried Noodle", "Stir-fried rice noodles with chicken, shrimp and vegetables in curry sauce, topped with sesame seeds.", null, undefined, "Confirm the price for the chicken-and-shrimp preparation."],
    ["Duangzen", "Spaghetti with snow peas, sweet corn, baby corn, carrots and zucchini in red or green curry.", 1095, [standardProtein, ["Curry", [["Red curry", 0], ["Green curry", 0]]]]],
  ],
  "Fried Rice": [
    ["Nasi Lemak", "Coconut rice with sambal, crispy fried anchovies, peanuts and cucumber slices.", null, undefined, "The printed menu does not show a price."],
    ["Pineapple Fried Rice", "Jasmine rice with curry powder, pineapple, raisins, cashews, chicken, pork, beef, shrimp, egg, scallions, onions, broccoli and carrots.", 1595],
    ["Tom Yum Fried Rice", "Jasmine rice with egg, bell peppers, onions, tomatoes, mushrooms, makrut lime leaves, chili paste and tom yum paste.", 1095, [standardProtein]],
    ["Nasi Goreng", "Fried rice with egg, carrots, Chinese broccoli, crispy anchovies, garlic and shrimp paste.", 1095, [standardProtein]],
    ["Kao Phad Kee Mao", "Basil fried rice with jasmine rice, egg, onions, carrots, broccoli and red and green bell peppers.", 1095, [standardProtein]],
    ["Thai Fried Rice", "Stir-fried jasmine rice with egg, scallions, onions, broccoli and carrots.", 1095, [standardProtein]],
  ],
  "Specialty Entrees": [
    ["Basil", "Stir-fried Thai hot basil with onions, bamboo shoots and bell peppers. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Sweet & Sour", "Pineapple, tomatoes, cucumber, onions and bell peppers in sweet-and-sour sauce. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Cashew Nut", "Stir-fried cashews and mixed vegetables in house sauce. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Pepper Steak", "Thai-style pepper steak with bell peppers and onions in brown sauce. Served with jasmine rice.", 1295, undefined, "Uses the printed beef price. Confirm whether other choices are offered."],
    ["Ginger", "Stir-fried ginger, mushrooms, bamboo shoots, onions and bell peppers. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Phad Phet", "Mixed vegetables stir-fried with red chili paste. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Mixed Vegetable", "Fresh mixed vegetables stir-fried in brown sauce. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Garlic", "Steamed broccoli, carrots and napa cabbage with your choice of protein in house sauce. Served with jasmine rice.", 1195, [entreeProtein]],
    ["Pad Ga Praw", "Stir-fried yellow onions, carrots, red and green bell peppers, fresh garlic, chili and basil. Served with jasmine rice.", 1195, [entreeProtein]],
  ],
  "Thai Curry": [
    ["Red Curry", "Red chili paste and coconut milk with bamboo shoots, red and green bell peppers, zucchini, basil and snow peas. Served with jasmine rice.", 1195, [curryProtein]],
    ["Green Curry", "Green chili paste and coconut milk with bamboo shoots, red and green bell peppers, zucchini, basil and snow peas. Served with jasmine rice.", 1195, [curryProtein]],
    ["Yellow Curry", "Yellow chili paste and coconut milk with potatoes, carrots and onions. Served with jasmine rice.", 1195, [curryProtein]],
    ["Panang Curry", "Thick coconut curry with makrut lime leaves, bamboo shoots, bell peppers and zucchini. Served with jasmine rice.", 1195, [curryProtein]],
    ["Massaman Curry", "Coconut curry with peanuts, onions, potatoes and carrots. Served with jasmine rice.", 1195, [curryProtein]],
  ],
  "Seafood Specials": [
    ["Crispy Basa Fish", "Deep-fried basa fillet with your choice of Thai chili sauce or curry. Served with jasmine rice.", 1795, [["Sauce", [["Thai chili sauce", 0], ["Curry", 0]]]]],
    ["Seafood Combination Prik Pao", "Shrimp, scallops and squid in Thai chili sauce with bamboo shoots, snow peas, carrots, mushrooms, broccoli, baby corn, zucchini and basil. Served with jasmine rice.", 1695],
    ["Red Snapper", "Deep-fried whole red snapper with spicy Thai sweet-and-sour chili sauce. Served with jasmine rice.", null, undefined, "Market price."],
    ["Lemon Fish", "Steamed whole fish with fresh chili, garlic and lemon. Served with jasmine rice.", null, undefined, "Market price."],
  ],
  "Duck Specials": [
    ["Basil Duck", "Duck stir-fried with Thai hot basil, onions, bell peppers, bamboo shoots and house sauce. Served with jasmine rice.", 1995],
    ["Roasted Duck", "Boneless roasted duck with a ginger and clove sauce. Served with jasmine rice.", 1995],
    ["Curry Duck", "Boneless roasted duck in panang curry with coconut milk, ground peanuts, bell peppers and makrut lime leaves. Served with jasmine rice.", 1995],
    ["Crispy Duck", "Boneless crispy duck with house Thai sauce and stir-fried vegetables. Served with jasmine rice.", 1995],
  ],
  "Noodle Soup": [
    ["Beef Noodle Soup", "Rice noodles with beef, bok choy, scallions, cilantro and crispy garlic.", 1195],
    ["Duck Noodle Soup", "Sliced roasted duck over rice noodles in duck broth.", 1295],
    ["Chicken Noodle Soup", "Rice noodles with scallions, crispy garlic and bok choy.", 1095],
  ],
  "Sides & Extras": [
    ["Jasmine Rice", "", 200],
    ["Sticky Rice", "", 295],
    ["Brown Rice", "", 295],
    ["Egg Fried Rice", "", 395],
    ["Peanut Sauce", "", 200],
    ["Fried Egg", "", 200],
    ["Extra Vegetables", "", 200],
    ["Extra Beef", "", 300],
    ["Extra Chicken", "", 300],
    ["Extra Shrimp", "", 300],
  ],
};

/** Zogam Cafe's storefront look, as data. The same values are applied to existing databases by migration 0015. */
export const zogamBranding = {
  colors: {
    light: { brand: "#17623b", hover: "#10492c", ink: "#ffffff", soft: "#e7f1e9", softInk: "#14532d", bg: "#faf8f5" },
    dark: { brand: "#8ed6a2", hover: "#a5e7b6", ink: "#102a1b", soft: "#193a29", softInk: "#b8e8c6", bg: "#121a15" },
  },
  logo: { src: "/brands/zogam-cafe-badge.png", alt: "Zogam Cafe Restaurant & Cafe", width: 551, height: 468 },
  tagline: "Explore our menu. Make it yours.",
  featured: ["Pad Thai", "Pineapple Fried Rice", "Green Curry", "Chicken Satay (5 pc)"],
  search: true,
};

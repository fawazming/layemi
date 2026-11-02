/* =========================================================
   LAYEMITURBAN — catalogue
   Four hero silhouettes, multiplied into sixteen curated pieces.
   Prices from prod.json (NGN), editions generated for the shop.
   ========================================================= */

const BASE_PRODUCTS = [
  {
    key: 'orange',
    name: 'Premium Orange Auto-Gele',
    image: 'assets/img/orange-autogele.png',
    category: 'Auto-Gele',
    price: 10000,
    color: 'Orange',
    material: 'Premium Aso-Oke',
    status: 'Ready-to-Wear',
    description:
      'Our signature auto-gele, hand-pleated from premium aso-oke in a sun-warmed orange. The pre-tied structure holds its sculptural folds from the first photograph to the last dance — no pins, no fuss, no stylist required.',
    details: ['Hand-pleated premium aso-oke', 'Pre-tied, ready-to-wear silhouette', 'Adjustable inner drawstring', 'One size fits most head sizes']
  },
  {
    key: 'royal-blue',
    name: 'Royal Blue Ruffle Turban Cap',
    image: 'assets/img/royal-blue-turban.png',
    category: 'Turban Caps',
    price: 10000,
    color: 'Royal Blue',
    material: 'Sequin-blend crepe',
    status: 'Ready-to-Wear',
    description:
      'A royal blue turban cap finished with a soft side ruffle and a whisper of blue sequin. Cut to sit beautifully on the crown, it is the piece you reach for when the invitation says “dress to be remembered”.',
    details: ['Side ruffle with blue sequin base', 'Structured, pre-tied cap', 'Soft breathable lining', 'One size — gentle stretch fit']
  },
  {
    key: 'gold',
    name: 'Gold Side Ruffles Turban Cap',
    image: 'assets/img/gold-turban.png',
    category: 'Turban Caps',
    price: 15000,
    color: 'Elegant Gold',
    material: 'Metallic silk blend',
    status: 'Custom / Ready-to-Ship',
    description:
      'Elegant gold side ruffles, hand-set to catch the light from every angle. A quiet statement piece for bridal mornings, milestone birthdays and every occasion that deserves a little more shine.',
    details: ['Hand-set side ruffles', 'Elegant gold metallic finish', 'Bridal & occasion ready', 'Available for delivery to Ibadan']
  },
  {
    key: 'red',
    name: 'Classic Red Polka-Dot Turban',
    image: 'assets/img/red-turban.png',
    category: 'Turban Caps',
    price: 4000,
    color: 'Classic Red',
    material: 'Soft cotton blend',
    status: 'Ready-to-Wear',
    description:
      'A classic red polka-dot turban with a sculpted knot design. Effortless, playful and endlessly wearable — the everyday crown that works as hard as you do.',
    details: ['Classic red polka-dot print', 'Sculpted knot design', 'Lightweight everyday comfort', 'One size — adjustable back']
  }
];

const EDITIONS = [
  {
    key: 'signature',
    label: 'Signature',
    suffix: '',
    multiplier: 1,
    badge: 'Bestseller',
    blurb: 'The original cut, exactly as it left the atelier.',
    extraDetails: ['Signature LAYEMITURBAN keepsake box', 'Complimentary care card', 'Ready to ship in 1–2 business days']
  },
  {
    key: 'bridal',
    label: 'Bridal',
    suffix: ' · Bridal',
    multiplier: 1.6,
    badge: 'Bridal',
    blurb: 'Elevated with pearl detailing and an heirloom finish for the aisle.',
    extraDetails: ['Bridal pearl pin included', 'Made-to-order in 5–7 days', 'Complimentary virtual fitting']
  },
  {
    key: 'festive',
    label: 'Festive',
    suffix: ' · Festive',
    multiplier: 1.3,
    badge: 'New',
    blurb: 'A richer, more sculptural finish for celebrations that run late.',
    extraDetails: ['Heightened structure & volume', 'Gold-thread finishing touch', 'Gift-ready festive packaging']
  },
  {
    key: 'everyday',
    label: 'Everyday',
    suffix: ' · Everyday',
    multiplier: 0.9,
    badge: null,
    blurb: 'Softer, lighter and made for the beautiful ordinary.',
    extraDetails: ['Lightweight everyday construction', 'Soft-touch inner band', 'Machine-delicate friendly']
  }
];

const roundPrice = (value) => Math.round(value / 500) * 500;

const PRODUCTS = BASE_PRODUCTS.flatMap((base, baseIndex) =>
  EDITIONS.map((edition, editionIndex) => {
    const price = roundPrice(base.price * edition.multiplier);
    const id = `${base.key}-${edition.key}`;
    return {
      id,
      sku: `LT-${String(baseIndex + 1).padStart(2, '0')}${String(editionIndex + 1).padStart(2, '0')}`,
      name: base.name + edition.suffix,
      baseName: base.name,
      image: base.image,
      category: base.category,
      collection: 'AUTOGELE & TURBAN COLLECTION',
      edition: edition.label,
      editionKey: edition.key,
      price,
      compareAt: edition.key === 'signature' ? null : roundPrice(base.price * 1.85),
      color: base.color,
      material: base.material,
      status: base.status,
      description: `${base.description} ${edition.blurb}`,
      details: [...base.details, ...edition.extraDetails],
      badge: edition.badge,
      rating: Math.round((4.6 + ((baseIndex * 3 + editionIndex * 2) % 4) * 0.1) * 10) / 10,
      reviews: 18 + ((baseIndex + 1) * (editionIndex + 3) * 7) % 96,
      stock: 4 + ((baseIndex + 2) * (editionIndex + 5) * 3) % 14,
      tags: [base.category, edition.label, price < 10000 ? 'under10' : 'over10']
    };
  })
);

/* Shuffle so the collection feels curated rather than grouped. */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const CATALOGUE = shuffle(PRODUCTS);

window.LT_PRODUCTS = CATALOGUE;
window.LT_BASE_PRODUCTS = BASE_PRODUCTS;

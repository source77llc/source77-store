/* ============================================================
   Source77 Store — products-seed.js
   Static seed products used when no API backend is configured.
   Exposed as window.SEED_PRODUCTS so shop.js can pick it up.

   fulfillment field (set per item in admin):
     'local'  → "Local pickup available" — item is in hand
     'direct' → "Ships directly to you" — ships from fulfillment
   ============================================================ */

var SEED_PRODUCTS = [
  {
    id: 'p1',
    title: 'OEM Brake Pad Set - Used Good',
    category: 'Car Parts',
    condition: 'Used - Good',
    price: 24.99,
    weight_lb: 2.5,
    quantity: 3,
    images: [],
    description: 'Factory brake pads removed during upgrade. Tested, 60% life remaining.',
    shipping: true,
    fulfillment: 'local'
  },
  {
    id: 'p2',
    title: 'Stainless Steel Mixing Bowls Set (3)',
    category: 'Home Goods',
    condition: 'New - Open Box',
    price: 18.99,
    weight_lb: 3.0,
    quantity: 5,
    images: [],
    description: 'Set of 3 nesting stainless bowls with lids. Minor packaging damage only.',
    shipping: true,
    fulfillment: 'local'
  },
  {
    id: 'p3',
    title: 'USB-C Fast Charging Cable 6ft (2-Pack)',
    category: 'Electronics',
    condition: 'New',
    price: 9.99,
    weight_lb: 0.3,
    quantity: 12,
    images: [],
    description: '10 Gbps data, 100W charging. Universal compatibility. Factory sealed.',
    shipping: true,
    fulfillment: 'local'
  },
  {
    id: 'p4',
    title: 'Assorted Kids Craft Supply Bundle',
    category: 'General Merchandise',
    condition: 'New',
    price: 14.99,
    weight_lb: 1.5,
    quantity: 8,
    images: [],
    description: 'Markers, colored pencils, foam sheets, stickers. Great for classrooms.',
    shipping: true,
    fulfillment: 'local'
  },
  {
    id: 'p5',
    title: 'Air Freshener Variety Pack (10 units)',
    category: 'General Merchandise',
    condition: 'New',
    price: 12.99,
    weight_lb: 1.0,
    quantity: 15,
    images: [],
    description: 'Mixed scents. Car and home clips. Individually wrapped.',
    shipping: true,
    fulfillment: 'local'
  },
  {
    id: 'p6',
    title: 'Bulk Paper Towels – 12 Roll Pack',
    category: 'Home Goods',
    condition: 'New',
    price: 19.99,
    weight_lb: 4.5,
    quantity: 10,
    images: [],
    description: 'Strong, 2-ply paper towels. Multi-pack quantity, sold at a great price.',
    shipping: true,
    fulfillment: 'direct'
  },
  {
    id: 'p7',
    title: 'Stainless Steel Water Bottle 40oz',
    category: 'Home Goods',
    condition: 'New',
    price: 22.99,
    weight_lb: 1.2,
    quantity: 8,
    images: [],
    description: 'Double-wall insulated. Keeps cold 24h, hot 12h.',
    shipping: true,
    fulfillment: 'direct'
  },
  {
    id: 'p8',
    title: 'Aromatherapy Essential Oil Diffuser',
    category: 'Home Goods',
    condition: 'New',
    price: 34.99,
    weight_lb: 1.1,
    quantity: 20,
    images: [],
    description: '500ml tank, 7 LED colors, auto-shutoff.',
    shipping: true,
    fulfillment: 'direct'
  },
  {
    id: 'p9',
    title: 'Pet Grooming Brush – Self-Cleaning',
    category: 'General Merchandise',
    condition: 'New',
    price: 18.99,
    weight_lb: 0.5,
    quantity: 30,
    images: [],
    description: 'Works on short and long fur. Easy clean button.',
    shipping: true,
    fulfillment: 'direct'
  }
];

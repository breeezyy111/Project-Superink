import type { WeaponKind } from './weapons';

// Everything you can own in Splashburg: weapon kits and gear.

export type Slot = 'head' | 'clothes' | 'shoes';
export type HeadStyle = 'none' | 'cap' | 'beanie' | 'headphones' | 'visor' | 'bucket' | 'goggles' | 'band';
export type ClothesStyle = 'tee' | 'stripe' | 'hoodie' | 'jersey' | 'tank';
export type ShoeStyle = 'sneaker' | 'hightop' | 'slipon';

export interface GearItem {
  id: string;
  slot: Slot;
  name: string;
  brand: string;
  price: number;
  level: number;
  style: HeadStyle | ClothesStyle | ShoeStyle;
  color: string;
  accent: string;
}

const G = (id: string, slot: Slot, name: string, brand: string, price: number, level: number, style: GearItem['style'], color: string, accent: string): GearItem =>
  ({ id, slot, name, brand, price, level, style, color, accent });

export const GEAR: GearItem[] = [
  // headgear
  G('h_none', 'head', 'No Headgear', '—', 0, 1, 'none', '#000', '#000'),
  G('h_cap_white', 'head', 'Splash Cap', 'Fizzwear', 0, 1, 'cap', '#ffffff', '#ff5c8a'),
  G('h_band_lime', 'head', 'Sweatband', 'Fizzwear', 400, 1, 'band', '#e4ff2f', '#15121c'),
  G('h_beanie_pink', 'head', 'Bubble Beanie', 'Krill Knits', 800, 2, 'beanie', '#ff5ca8', '#ffffff'),
  G('h_headphones', 'head', 'Studio Fins', 'Reef Audio', 1500, 3, 'headphones', '#2b2b33', '#5cd6ff'),
  G('h_visor_cyan', 'head', 'Pro Visor', 'Grindline', 1000, 2, 'visor', '#2ec8ff', '#ffffff'),
  G('h_bucket_tan', 'head', 'Bucket Hat', 'Tidepool', 1200, 3, 'bucket', '#e8d2a6', '#7a5a2e'),
  G('h_goggles', 'head', 'Dive Goggles', 'Tidepool', 2200, 5, 'goggles', '#ffd23f', '#2ec8ff'),
  G('h_cap_black', 'head', 'Night Cap', 'Grindline', 1800, 4, 'cap', '#2b2b33', '#e4ff2f'),
  // clothes
  G('c_tee_white', 'clothes', 'Basic Tee', 'Fizzwear', 0, 1, 'tee', '#ffffff', '#ffffff'),
  G('c_tee_yellow', 'clothes', 'Sunny Tee', 'Fizzwear', 300, 1, 'tee', '#ffd84d', '#ffd84d'),
  G('c_stripe_navy', 'clothes', 'Sailor Stripes', 'Tidepool', 900, 2, 'stripe', '#ffffff', '#2b4cff'),
  G('c_hoodie_purple', 'clothes', 'Grape Hoodie', 'Krill Knits', 1600, 3, 'hoodie', '#9b7bff', '#ffffff'),
  G('c_jersey_red', 'clothes', 'Court Jersey', 'Grindline', 1400, 3, 'jersey', '#ff4a4a', '#ffffff'),
  G('c_tank_mint', 'clothes', 'Mint Tank', 'Tidepool', 700, 2, 'tank', '#5ff0d0', '#5ff0d0'),
  G('c_hoodie_black', 'clothes', 'Shadow Hoodie', 'Krill Knits', 2600, 5, 'hoodie', '#2b2b33', '#ff2fa8'),
  G('c_stripe_pink', 'clothes', 'Candy Stripes', 'Fizzwear', 1100, 4, 'stripe', '#ffffff', '#ff5ca8'),
  // shoes
  G('s_sneaker_white', 'shoes', 'Clean Kicks', 'Fizzwear', 0, 1, 'sneaker', '#ffffff', '#ff5c8a'),
  G('s_sneaker_red', 'shoes', 'Red Runners', 'Grindline', 500, 1, 'sneaker', '#ff4a4a', '#ffffff'),
  G('s_hightop_black', 'shoes', 'Grind Hi-Tops', 'Grindline', 1300, 3, 'hightop', '#2b2b33', '#e4ff2f'),
  G('s_slipon_check', 'shoes', 'Check Slip-Ons', 'Tidepool', 900, 2, 'slipon', '#ffffff', '#15121c'),
  G('s_hightop_yellow', 'shoes', 'Lemon Hi-Tops', 'Grindline', 2000, 4, 'hightop', '#ffd23f', '#ffffff'),
];

export function gear(id: string): GearItem {
  return GEAR.find((g) => g.id === id) ?? GEAR[0];
}

export function gearIn(slot: Slot) {
  return GEAR.filter((g) => g.slot === slot);
}

export const STARTER_ITEMS = ['h_none', 'h_cap_white', 'c_tee_white', 's_sneaker_white', 'kit_fizz'];

// ---------- weapon kits (main + sub + special) ----------

export type SubKind = 'burst' | 'pop' | 'slide' | 'mine';
export type SpecialKind = 'squall' | 'tsunami' | 'shield' | 'jet';

export interface Kit {
  id: string;
  main: WeaponKind;
  sub: SubKind;
  special: SpecialKind;
  price: number;
  level: number;
}

export const KITS: Kit[] = [
  { id: 'kit_fizz', main: 'shooter', sub: 'burst', special: 'squall', price: 0, level: 1 },
  { id: 'kit_roller', main: 'roller', sub: 'slide', special: 'tsunami', price: 1200, level: 2 },
  { id: 'kit_charger', main: 'charger', sub: 'mine', special: 'shield', price: 1800, level: 3 },
  { id: 'kit_boom', main: 'blaster', sub: 'pop', special: 'jet', price: 2400, level: 4 },
];

export function kit(id: string): Kit {
  return KITS.find((k) => k.id === id) ?? KITS[0];
}

export const SUBS: Record<SubKind, { name: string; blurb: string; cost: number }> = {
  burst: { name: 'Fizz Burst', blurb: 'Small bomb that pops the moment it hits something.', cost: 40 },
  pop: { name: 'Pop Bomb', blurb: 'Bouncy bomb that bursts after a short fuse. Huge splash.', cost: 70 },
  slide: { name: 'Slide Bomb', blurb: 'Skids along the ground painting a lane, then bursts.', cost: 65 },
  mine: { name: 'Ink Mine', blurb: 'Hidden trap that bursts when an enemy gets close.', cost: 55 },
};

export const SPECIALS: Record<SpecialKind, { name: string; blurb: string }> = {
  squall: { name: 'Squall Cloud', blurb: 'Throw a storm cloud that rains your ink over an area.' },
  tsunami: { name: 'Ink Tsunami', blurb: 'Slam the ground and send a giant wave of ink rolling forward.' },
  shield: { name: 'Shell Shield', blurb: 'Pop a bubble dome that blocks enemy ink.' },
  jet: { name: 'Turbo Jet', blurb: 'Blast into the sky on an ink jetpack and rain explosive shots.' },
};

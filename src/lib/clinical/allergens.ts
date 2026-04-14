/**
 * Static allergen database for instant local search.
 * Covers common drug, food, and environmental allergens.
 */

export type AllergenCategory = 'drug' | 'food' | 'environmental';

export interface Allergen {
  name: string;
  category: AllergenCategory;
  aliases: string[];
  drugClass?: string;
}

export const COMMON_ALLERGENS: Allergen[] = [
  // ── Drug Allergies (sorted by frequency) ──
  { name: 'Penicillin', category: 'drug', aliases: ['PCN', 'pen'], drugClass: 'penicillin' },
  { name: 'Amoxicillin', category: 'drug', aliases: ['amox'], drugClass: 'penicillin' },
  { name: 'Ampicillin', category: 'drug', aliases: [], drugClass: 'penicillin' },
  {
    name: 'Sulfa drugs',
    category: 'drug',
    aliases: ['sulfonamide', 'sulfa', 'sulfamethoxazole', 'Bactrim', 'Septra'],
    drugClass: 'sulfonamide',
  },
  {
    name: 'Aspirin',
    category: 'drug',
    aliases: ['ASA', 'acetylsalicylic acid'],
    drugClass: 'NSAID',
  },
  { name: 'Ibuprofen', category: 'drug', aliases: ['Advil', 'Motrin'], drugClass: 'NSAID' },
  { name: 'Naproxen', category: 'drug', aliases: ['Aleve', 'Naprosyn'], drugClass: 'NSAID' },
  {
    name: 'NSAIDs',
    category: 'drug',
    aliases: ['non-steroidal anti-inflammatory'],
    drugClass: 'NSAID',
  },
  { name: 'Codeine', category: 'drug', aliases: [], drugClass: 'opioid' },
  { name: 'Morphine', category: 'drug', aliases: [], drugClass: 'opioid' },
  { name: 'Hydrocodone', category: 'drug', aliases: ['Vicodin', 'Norco'], drugClass: 'opioid' },
  { name: 'Oxycodone', category: 'drug', aliases: ['OxyContin', 'Percocet'], drugClass: 'opioid' },
  { name: 'Tramadol', category: 'drug', aliases: ['Ultram'], drugClass: 'opioid' },
  {
    name: 'Cephalosporins',
    category: 'drug',
    aliases: ['cephalexin', 'Keflex', 'ceftriaxone'],
    drugClass: 'cephalosporin',
  },
  { name: 'Erythromycin', category: 'drug', aliases: ['E-Mycin'], drugClass: 'macrolide' },
  {
    name: 'Azithromycin',
    category: 'drug',
    aliases: ['Zithromax', 'Z-pack'],
    drugClass: 'macrolide',
  },
  { name: 'Clarithromycin', category: 'drug', aliases: ['Biaxin'], drugClass: 'macrolide' },
  {
    name: 'Fluoroquinolones',
    category: 'drug',
    aliases: ['ciprofloxacin', 'Cipro', 'levofloxacin', 'Levaquin'],
    drugClass: 'fluoroquinolone',
  },
  {
    name: 'Tetracycline',
    category: 'drug',
    aliases: ['doxycycline', 'minocycline'],
    drugClass: 'tetracycline',
  },
  { name: 'Metronidazole', category: 'drug', aliases: ['Flagyl'], drugClass: 'nitroimidazole' },
  { name: 'Clindamycin', category: 'drug', aliases: ['Cleocin'], drugClass: 'lincosamide' },
  { name: 'Vancomycin', category: 'drug', aliases: ['Vancocin'], drugClass: 'glycopeptide' },
  {
    name: 'ACE inhibitors',
    category: 'drug',
    aliases: ['lisinopril', 'enalapril', 'ramipril', 'benazepril'],
    drugClass: 'ACE inhibitor',
  },
  {
    name: 'Statins',
    category: 'drug',
    aliases: ['atorvastatin', 'Lipitor', 'rosuvastatin', 'Crestor', 'simvastatin'],
    drugClass: 'statin',
  },
  { name: 'Metformin', category: 'drug', aliases: ['Glucophage'], drugClass: 'biguanide' },
  {
    name: 'Insulin',
    category: 'drug',
    aliases: ['Humalog', 'Novolog', 'Lantus'],
    drugClass: 'insulin',
  },
  {
    name: 'Latex',
    category: 'drug',
    aliases: ['latex gloves', 'natural rubber latex'],
    drugClass: 'latex',
  },
  {
    name: 'Iodine',
    category: 'drug',
    aliases: ['Betadine', 'povidone-iodine'],
    drugClass: 'iodine',
  },
  {
    name: 'Contrast dye',
    category: 'drug',
    aliases: ['IV contrast', 'CT contrast', 'iodinated contrast', 'gadolinium'],
    drugClass: 'contrast',
  },
  { name: 'Lidocaine', category: 'drug', aliases: ['Xylocaine'], drugClass: 'local anesthetic' },
  { name: 'Novocaine', category: 'drug', aliases: ['procaine'], drugClass: 'local anesthetic' },
  {
    name: 'Benzodiazepines',
    category: 'drug',
    aliases: ['diazepam', 'Valium', 'lorazepam', 'Ativan', 'alprazolam', 'Xanax'],
    drugClass: 'benzodiazepine',
  },
  { name: 'Gabapentin', category: 'drug', aliases: ['Neurontin'], drugClass: 'gabapentinoid' },
  { name: 'Pregabalin', category: 'drug', aliases: ['Lyrica'], drugClass: 'gabapentinoid' },
  { name: 'Phenytoin', category: 'drug', aliases: ['Dilantin'], drugClass: 'anticonvulsant' },
  { name: 'Carbamazepine', category: 'drug', aliases: ['Tegretol'], drugClass: 'anticonvulsant' },
  { name: 'Lamotrigine', category: 'drug', aliases: ['Lamictal'], drugClass: 'anticonvulsant' },
  {
    name: 'Semaglutide',
    category: 'drug',
    aliases: ['Ozempic', 'Wegovy', 'Rybelsus'],
    drugClass: 'GLP-1 agonist',
  },
  {
    name: 'Tirzepatide',
    category: 'drug',
    aliases: ['Mounjaro', 'Zepbound'],
    drugClass: 'GLP-1/GIP agonist',
  },
  {
    name: 'Liraglutide',
    category: 'drug',
    aliases: ['Victoza', 'Saxenda'],
    drugClass: 'GLP-1 agonist',
  },
  {
    name: 'Testosterone',
    category: 'drug',
    aliases: ['TRT', 'testosterone cypionate', 'AndroGel'],
    drugClass: 'androgen',
  },
  { name: 'Estrogen', category: 'drug', aliases: ['estradiol', 'Premarin'], drugClass: 'estrogen' },
  { name: 'Progesterone', category: 'drug', aliases: ['Prometrium'], drugClass: 'progestin' },
  { name: 'Warfarin', category: 'drug', aliases: ['Coumadin'], drugClass: 'anticoagulant' },
  {
    name: 'Heparin',
    category: 'drug',
    aliases: ['Lovenox', 'enoxaparin'],
    drugClass: 'anticoagulant',
  },
  {
    name: 'SSRIs',
    category: 'drug',
    aliases: ['sertraline', 'Zoloft', 'fluoxetine', 'Prozac', 'escitalopram', 'Lexapro'],
    drugClass: 'SSRI',
  },
  {
    name: 'Allopurinol',
    category: 'drug',
    aliases: ['Zyloprim'],
    drugClass: 'xanthine oxidase inhibitor',
  },
  {
    name: 'Methotrexate',
    category: 'drug',
    aliases: ['MTX', 'Trexall'],
    drugClass: 'antimetabolite',
  },
  {
    name: 'Hydroxychloroquine',
    category: 'drug',
    aliases: ['Plaquenil'],
    drugClass: 'antimalarial',
  },

  // ── Food Allergies ──
  { name: 'Peanuts', category: 'food', aliases: ['peanut', 'groundnut'] },
  {
    name: 'Tree nuts',
    category: 'food',
    aliases: ['almonds', 'walnuts', 'cashews', 'pecans', 'pistachios', 'hazelnuts', 'macadamia'],
  },
  {
    name: 'Shellfish',
    category: 'food',
    aliases: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster'],
  },
  { name: 'Fish', category: 'food', aliases: ['salmon', 'tuna', 'cod', 'halibut'] },
  { name: 'Milk', category: 'food', aliases: ['dairy', 'lactose', 'casein', 'whey'] },
  { name: 'Eggs', category: 'food', aliases: ['egg', 'egg whites', 'egg yolks'] },
  { name: 'Wheat', category: 'food', aliases: ['gluten', 'wheat gluten'] },
  { name: 'Soy', category: 'food', aliases: ['soybean', 'soya'] },
  { name: 'Sesame', category: 'food', aliases: ['sesame seeds', 'tahini'] },
  { name: 'Corn', category: 'food', aliases: ['maize'] },
  {
    name: 'Sulfites',
    category: 'food',
    aliases: ['sulfite', 'sodium sulfite', 'sodium bisulfite'],
  },
  { name: 'MSG', category: 'food', aliases: ['monosodium glutamate'] },
  { name: 'Celery', category: 'food', aliases: [] },
  { name: 'Mustard', category: 'food', aliases: [] },
  { name: 'Lupin', category: 'food', aliases: ['lupine'] },
  { name: 'Mollusks', category: 'food', aliases: ['squid', 'octopus', 'snail'] },

  // ── Environmental Allergies ──
  {
    name: 'Pollen',
    category: 'environmental',
    aliases: ['hay fever', 'ragweed', 'grass pollen', 'tree pollen'],
  },
  { name: 'Dust mites', category: 'environmental', aliases: ['dust', 'house dust'] },
  { name: 'Mold', category: 'environmental', aliases: ['mildew', 'fungal spores'] },
  {
    name: 'Pet dander',
    category: 'environmental',
    aliases: ['cat dander', 'dog dander', 'animal dander'],
  },
  {
    name: 'Bee stings',
    category: 'environmental',
    aliases: ['bee venom', 'wasp stings', 'hornet', 'yellow jacket'],
  },
  { name: 'Cockroach', category: 'environmental', aliases: ['cockroach droppings'] },
  { name: 'Nickel', category: 'environmental', aliases: ['nickel allergy', 'metal allergy'] },
  {
    name: 'Poison ivy',
    category: 'environmental',
    aliases: ['poison oak', 'poison sumac', 'urushiol'],
  },
  { name: 'Formaldehyde', category: 'environmental', aliases: [] },
  {
    name: 'Fragrances',
    category: 'environmental',
    aliases: ['perfume', 'cologne', 'scented products'],
  },
];

/**
 * Search allergens by name or alias (case-insensitive prefix match).
 */
export function searchAllergens(query: string): Allergen[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  return COMMON_ALLERGENS.filter((a) => {
    if (a.name.toLowerCase().includes(q)) return true;
    return a.aliases.some((alias) => alias.toLowerCase().includes(q));
  }).slice(0, 15);
}

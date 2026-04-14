/**
 * Drug class cross-reference map for allergy safety checking.
 *
 * When a patient has an allergy to a drug CLASS (e.g., "penicillin"),
 * we flag any medication that belongs to that class or a related class.
 */

export interface DrugClassEntry {
  className: string;
  members: string[];
  /** Related classes that share cross-reactivity risk */
  crossReactive?: string[];
}

export const DRUG_CLASSES: DrugClassEntry[] = [
  {
    className: 'penicillin',
    members: [
      'penicillin',
      'amoxicillin',
      'ampicillin',
      'piperacillin',
      'nafcillin',
      'oxacillin',
      'dicloxacillin',
      'augmentin',
      'amoxicillin/clavulanate',
      'ampicillin/sulbactam',
      'piperacillin/tazobactam',
      'unasyn',
      'zosyn',
    ],
    crossReactive: ['cephalosporin'],
  },
  {
    className: 'cephalosporin',
    members: [
      'cephalexin',
      'cefazolin',
      'ceftriaxone',
      'cefdinir',
      'cefuroxime',
      'ceftazidime',
      'cefepime',
      'cefpodoxime',
      'cefixime',
      'keflex',
      'ancef',
      'rocephin',
      'omnicef',
    ],
    crossReactive: ['penicillin'],
  },
  {
    className: 'sulfonamide',
    members: [
      'sulfamethoxazole',
      'sulfasalazine',
      'sulfadiazine',
      'bactrim',
      'septra',
      'trimethoprim/sulfamethoxazole',
    ],
  },
  {
    className: 'NSAID',
    members: [
      'aspirin',
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'indomethacin',
      'ketorolac',
      'meloxicam',
      'piroxicam',
      'celecoxib',
      'advil',
      'motrin',
      'aleve',
      'voltaren',
      'toradol',
      'mobic',
      'celebrex',
    ],
  },
  {
    className: 'opioid',
    members: [
      'codeine',
      'morphine',
      'hydrocodone',
      'oxycodone',
      'fentanyl',
      'tramadol',
      'hydromorphone',
      'methadone',
      'meperidine',
      'buprenorphine',
      'vicodin',
      'norco',
      'percocet',
      'oxycontin',
      'dilaudid',
      'demerol',
      'ultram',
      'suboxone',
    ],
  },
  {
    className: 'macrolide',
    members: ['erythromycin', 'azithromycin', 'clarithromycin', 'zithromax', 'biaxin', 'z-pack'],
  },
  {
    className: 'fluoroquinolone',
    members: [
      'ciprofloxacin',
      'levofloxacin',
      'moxifloxacin',
      'ofloxacin',
      'cipro',
      'levaquin',
      'avelox',
    ],
  },
  {
    className: 'tetracycline',
    members: ['tetracycline', 'doxycycline', 'minocycline', 'demeclocycline'],
  },
  {
    className: 'statin',
    members: [
      'atorvastatin',
      'rosuvastatin',
      'simvastatin',
      'pravastatin',
      'lovastatin',
      'fluvastatin',
      'pitavastatin',
      'lipitor',
      'crestor',
      'zocor',
    ],
  },
  {
    className: 'ACE inhibitor',
    members: [
      'lisinopril',
      'enalapril',
      'ramipril',
      'benazepril',
      'captopril',
      'fosinopril',
      'quinapril',
      'trandolapril',
      'perindopril',
      'prinivil',
      'zestril',
      'vasotec',
      'altace',
    ],
  },
  {
    className: 'ARB',
    members: [
      'losartan',
      'valsartan',
      'irbesartan',
      'candesartan',
      'olmesartan',
      'telmisartan',
      'azilsartan',
      'cozaar',
      'diovan',
      'avapro',
    ],
  },
  {
    className: 'benzodiazepine',
    members: [
      'diazepam',
      'lorazepam',
      'alprazolam',
      'clonazepam',
      'midazolam',
      'temazepam',
      'triazolam',
      'valium',
      'ativan',
      'xanax',
      'klonopin',
    ],
  },
  {
    className: 'SSRI',
    members: [
      'sertraline',
      'fluoxetine',
      'escitalopram',
      'citalopram',
      'paroxetine',
      'fluvoxamine',
      'zoloft',
      'prozac',
      'lexapro',
      'celexa',
      'paxil',
    ],
  },
  {
    className: 'anticoagulant',
    members: [
      'warfarin',
      'heparin',
      'enoxaparin',
      'apixaban',
      'rivaroxaban',
      'dabigatran',
      'coumadin',
      'lovenox',
      'eliquis',
      'xarelto',
      'pradaxa',
    ],
  },
  {
    className: 'GLP-1 agonist',
    members: [
      'semaglutide',
      'tirzepatide',
      'liraglutide',
      'dulaglutide',
      'exenatide',
      'ozempic',
      'wegovy',
      'rybelsus',
      'mounjaro',
      'zepbound',
      'victoza',
      'saxenda',
      'trulicity',
      'byetta',
      'bydureon',
    ],
  },
  {
    className: 'local anesthetic',
    members: [
      'lidocaine',
      'bupivacaine',
      'ropivacaine',
      'mepivacaine',
      'procaine',
      'novocaine',
      'xylocaine',
      'marcaine',
    ],
  },
  {
    className: 'contrast',
    members: [
      'iodinated contrast',
      'gadolinium',
      'IV contrast',
      'CT contrast',
      'MRI contrast',
      'contrast dye',
    ],
  },
];

/**
 * Check if a medication matches any allergy by drug class.
 * Returns the matching allergy and reason if found.
 */
export function checkAllergyDrugClass(
  medication: string,
  allergies: string[]
): { allergy: string; medication: string; reason: string; severity: 'high' | 'moderate' } | null {
  const medLower = medication.toLowerCase().trim();
  const allergyLowers = allergies.map((a) => a.toLowerCase().trim());

  for (const entry of DRUG_CLASSES) {
    const medInClass =
      entry.members.some((m) => medLower.includes(m.toLowerCase())) ||
      medLower.includes(entry.className.toLowerCase());

    if (!medInClass) continue;

    // Direct class match: allergy IS this drug class
    for (const allergy of allergyLowers) {
      const allergyMatchesClass =
        allergy.includes(entry.className.toLowerCase()) ||
        entry.members.some((m) => allergy.includes(m.toLowerCase()));

      if (allergyMatchesClass) {
        return {
          allergy: allergies[allergyLowers.indexOf(allergy)],
          medication,
          reason: `${medication} belongs to the ${entry.className} class`,
          severity: 'high',
        };
      }
    }

    // Cross-reactive class match
    if (entry.crossReactive) {
      for (const relatedClass of entry.crossReactive) {
        const relatedEntry = DRUG_CLASSES.find((d) => d.className === relatedClass);
        if (!relatedEntry) continue;

        for (const allergy of allergyLowers) {
          const allergyMatchesRelated =
            allergy.includes(relatedEntry.className.toLowerCase()) ||
            relatedEntry.members.some((m) => allergy.includes(m.toLowerCase()));

          if (allergyMatchesRelated) {
            return {
              allergy: allergies[allergyLowers.indexOf(allergy)],
              medication,
              reason: `${medication} (${entry.className}) has cross-reactivity risk with ${relatedEntry.className}`,
              severity: 'moderate',
            };
          }
        }
      }
    }
  }

  return null;
}

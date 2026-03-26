export interface HandbookSubsection {
  heading: string;
  body: string;
}

export interface HandbookSection {
  id: string;
  number: number;
  title: string;
  subsections: HandbookSubsection[];
}

export const handbookTitle = 'GLP-1 Patient Handbook';
export const handbookSubtitle =
  'A Complete Medical & Lifestyle Guide to Your Weight Loss Journey';

export const handbookSections: HandbookSection[] = [
  {
    id: 'understanding-your-program',
    number: 1,
    title: 'Understanding Your Program',
    subsections: [
      {
        heading: 'What Makes This Program Different',
        body: `**This is not a diet.** This is a medically guided metabolic reset program.

Your treatment includes:

- Licensed provider oversight
- Prescription-grade GLP-1 medication
- Structured dosing protocols
- Ongoing coaching and monitoring
- Long-term metabolic support

Unlike traditional weight loss methods, this program targets the biological drivers of weight gain — not just willpower.`,
      },
      {
        heading: 'The Science Behind GLP-1 & GIP',
        body: `Your body naturally produces hormones that control hunger and blood sugar. GLP-1 medications work with these systems, not against them.

**How GLP-1 medications work:**

- Sending a "full" signal to your brain
- Slowing how fast food leaves your stomach
- Reducing blood sugar spikes
- Decreasing cravings

**Tirzepatide (dual-action advantage):**

- Activates both GLP-1 and GIP receptors
- Enhances fat metabolism even further
- Leads to greater weight loss potential`,
      },
      {
        heading: 'Why Most Diets Fail — And Why This Works',
        body: `Most diets fail because they ignore biology:

- Hunger hormones increase
- Metabolism slows
- Cravings intensify

GLP-1 therapy corrects these imbalances, making weight loss more predictable, more sustainable, and less mentally exhausting.`,
      },
    ],
  },
  {
    id: 'realistic-timeline',
    number: 2,
    title: 'What to Expect — Realistic Timeline',
    subsections: [
      {
        heading: 'Phase 1: Adjustment (Weeks 1–4)',
        body: `**What's happening internally:**

- Your body is adapting to slower digestion
- Appetite hormones are being regulated

**What you may feel:**

- Reduced hunger
- Full faster than usual
- Mild nausea (especially if overeating)

This phase is about adjustment. Your body is learning to work with the medication.`,
      },
      {
        heading: 'Phase 2: Acceleration (Weeks 4–12)',
        body: `This is where most patients notice major changes:

- Consistent weight loss begins
- Cravings significantly decrease
- Portion sizes naturally shrink

**Key shift:** You stop thinking about food constantly. The mental burden of dieting begins to lift, and healthier choices become the default.`,
      },
      {
        heading: 'Phase 3: Optimization (3+ Months)',
        body: `This is where long-term transformation happens:

- Fat loss becomes steady and controlled
- Energy improves
- Lifestyle habits become automatic

Your body has adapted to the medication, and the focus shifts to sustaining and optimizing your results.`,
      },
    ],
  },
  {
    id: 'dosing',
    number: 3,
    title: 'Dosing — What You Need to Know',
    subsections: [
      {
        heading: 'Why Dosing Is Gradual',
        body: `Your body needs time to adjust. Increasing too fast can cause nausea, fatigue, and gastrointestinal discomfort.

That's why we follow a step-up protocol — starting low and increasing only when your body is ready.`,
      },
      {
        heading: 'General Dosing Principles',
        body: `- Start low, increase slowly
- Stay at a dose until your body adapts
- Adjustments are based on appetite control, weight loss progress, and side effects

Your provider will personalize your schedule based on how you respond.`,
      },
      {
        heading: 'Important Dosing Rules',
        body: `- **Never double dose** — if you miss a dose, follow the missed-dose protocol
- **Never increase without provider guidance** — more medication does not mean faster results
- **Consistency is more important than speed** — steady progress leads to lasting results`,
      },
    ],
  },
  {
    id: 'injection-mastery',
    number: 4,
    title: 'Injection Mastery',
    subsections: [
      {
        heading: 'Subcutaneous Injection Explained',
        body: `This medication is injected into fat tissue, not muscle. This allows:

- Slow, controlled absorption
- Better tolerance
- Longer-lasting effects

The injection is simple and most patients become comfortable with it within the first few weeks.`,
      },
      {
        heading: 'Step-by-Step Injection Breakdown',
        body: `**1. Preparation**
- Wash hands thoroughly
- Clean the vial top with an alcohol swab

**2. Drawing Medication**
- Insert the needle into the vial
- Pull back slowly to the prescribed units
- Remove any air bubbles by gently tapping the syringe

**3. Injection**
- Pinch the skin lightly at your chosen injection site
- Insert the needle at a 90-degree angle
- Inject slowly and steadily

**4. Aftercare**
- Remove the needle smoothly
- Apply light pressure with a clean cotton ball (do not rub aggressively)
- Dispose of the needle safely in a sharps container`,
      },
      {
        heading: 'Injection Best Practices',
        body: `- Inject at the same time each week for consistency
- Rotate injection sites (abdomen, thigh, upper arm)
- Avoid injecting into irritated, bruised, or scarred areas
- Let the medication reach room temperature for 10–15 minutes before injecting
- Keep the area clean and dry before and after`,
      },
    ],
  },
  {
    id: 'side-effects',
    number: 5,
    title: 'Side Effects — Deep Understanding',
    subsections: [
      {
        heading: 'Why Side Effects Happen',
        body: `Your digestive system is slowing down. This is intentional — it's how the medication reduces appetite and helps you eat less naturally.

Most side effects are a sign the medication is working, not that something is wrong.`,
      },
      {
        heading: 'Nausea',
        body: `The most common side effect, usually caused by eating too much or too fast.

**Solutions:**
- Eat smaller, more frequent meals
- Eat slowly and stop at the first sign of fullness
- Avoid greasy, fried, or very rich foods
- Ginger tea or ginger chews can help
- Take your injection in the evening so the peak effect occurs during sleep`,
      },
      {
        heading: 'Constipation',
        body: `Slower digestion means slower bowel movements. This is common and manageable.

**Solutions:**
- Increase water intake (aim for 64+ oz daily)
- Add fiber through fruits, vegetables, and whole grains
- Magnesium supplements can help
- Stay physically active — even a short walk stimulates digestion`,
      },
      {
        heading: 'Fatigue',
        body: `Often caused by reduced calorie intake as your appetite decreases.

**Solutions:**
- Increase protein intake (at least 60–80g daily)
- Stay well hydrated throughout the day
- Don't skip meals — eat small, nutrient-dense meals even when not hungry
- Maintain a regular sleep schedule`,
      },
      {
        heading: 'Injection Site Reactions',
        body: `Mild redness, swelling, or itching at the injection site is common, especially in people with sensitive skin. This is not an allergy in most cases — it's a normal localized response.

**Solutions:**
- Rotate injection sites each week
- Let the medication warm to room temperature before injecting
- Inject slowly and steadily
- Do not rub the site afterward`,
      },
      {
        heading: 'When Side Effects Improve',
        body: `Most side effects peak during the first few weeks at each dose level and improve as your body adapts. By the time you've been at a stable dose for 2–4 weeks, the majority of patients report significant improvement.`,
      },
    ],
  },
  {
    id: 'nutrition',
    number: 6,
    title: 'Nutrition — This Determines Your Results',
    subsections: [
      {
        heading: 'The Golden Rule: Eat Less, But Eat Smarter',
        body: `Because you'll eat less on this medication, every bite matters more. The quality of your food directly impacts your energy, muscle preservation, and overall results.

Focus on nutrient density — getting the most nutrition from the fewest calories.`,
      },
      {
        heading: 'Protein Is Your Foundation',
        body: `**Target:** 0.7–1g of protein per pound of your goal body weight

**Why protein matters:**

- Prevents muscle loss during weight loss
- Keeps your metabolism high
- Reduces fatigue and keeps you feeling full longer

**High-protein foods to prioritize:**
- Chicken, turkey, lean beef, fish
- Eggs and egg whites
- Greek yogurt and cottage cheese
- Legumes, tofu, tempeh
- Protein shakes or bars as needed`,
      },
      {
        heading: 'Ideal Meal Structure',
        body: `Each meal should include three components:

- **Protein** — the foundation of every plate
- **Fiber** — vegetables, fruits, whole grains
- **Healthy fat** — avocado, olive oil, nuts

**Example meal:** Grilled chicken + roasted vegetables + half an avocado

Eat protein first at every meal to ensure you get it in before feeling full.`,
      },
      {
        heading: 'Foods That Work Against You',
        body: `**Avoid or limit:**

- Fried foods
- Sugary drinks (soda, juice, sweetened coffee)
- Ultra-processed snacks (chips, cookies, candy)

These foods can trigger nausea, slow your progress, and provide empty calories that your body doesn't need while eating less.`,
      },
    ],
  },
  {
    id: 'hydration',
    number: 7,
    title: 'Hydration & Electrolytes',
    subsections: [
      {
        heading: 'Why Hydration Is Critical',
        body: `GLP-1 medications slow digestion and can reduce your natural thirst signals. This increases the risk of:

- Dehydration
- Fatigue
- Constipation
- Headaches

Many patients don't realize they're under-hydrated because they simply don't feel thirsty.`,
      },
      {
        heading: 'Daily Targets',
        body: `- **64–100 oz of water per day** (8–12 cups)
- Add electrolytes if you're active, in a warm climate, or experiencing muscle cramps
- Sip throughout the day — don't try to catch up all at once
- Track your intake if needed (a water bottle with time markings can help)

**What counts:** Water, herbal tea, sugar-free electrolyte drinks, broth

**What to limit:** Sugary drinks, excessive caffeine, alcohol`,
      },
    ],
  },
  {
    id: 'exercise',
    number: 8,
    title: 'Exercise (Smart Approach)',
    subsections: [
      {
        heading: 'You Don\'t Need Extreme Workouts',
        body: `The best exercise plan during GLP-1 treatment is sustainable and moderate. You don't need to spend hours in the gym.

**Focus on:**

- Walking daily (20–30 minutes)
- Light resistance training (2–3 times per week)

Start where you are and build gradually. Even 10 minutes counts.`,
      },
      {
        heading: 'Why Exercise Still Matters',
        body: `Even though the medication drives most of the weight loss, exercise plays a critical supporting role:

- **Preserves muscle mass** — the most important benefit during weight loss
- **Enhances fat loss** — improves body composition beyond what the scale shows
- **Improves insulin sensitivity** — amplifies your medication's effect
- **Boosts mood and energy** — counteracts the fatigue some patients experience

Consistency beats intensity. A daily walk does more than one intense workout per week.`,
      },
    ],
  },
  {
    id: 'plateaus',
    number: 9,
    title: 'Plateaus',
    subsections: [
      {
        heading: 'Weight Loss Is Not Linear',
        body: `Every patient experiences plateaus. The normal pattern is:

**Lose → Stall → Lose again**

This is not a sign the medication stopped working. It's a sign your body is adjusting.`,
      },
      {
        heading: 'Why Plateaus Happen',
        body: `- Your body adapts to a lower weight and recalibrates its energy needs
- Water retention can temporarily mask fat loss
- Hormonal shifts (especially for women) can cause fluctuations
- Metabolic adaptation is a normal biological response`,
      },
      {
        heading: 'What to Do During a Plateau',
        body: `- **Stay consistent** — don't panic or make drastic changes
- **Do NOT increase your dose without provider guidance** — plateaus are rarely about dose
- **Review your nutrition** — are you eating enough protein? Drinking enough water?
- **Increase activity slightly** — add an extra walk or an additional strength session
- **Trust the process** — plateaus typically resolve within 1–3 weeks

The patients who get the best long-term results are the ones who stay steady during plateaus.`,
      },
    ],
  },
  {
    id: 'long-term-success',
    number: 10,
    title: 'Long-Term Success Strategy',
    subsections: [
      {
        heading: 'This Is the Most Important Section',
        body: `Medication helps you lose weight. **Habits keep it off.**

The real transformation isn't just the number on the scale — it's the daily routines, mindset shifts, and lifestyle changes you build along the way.`,
      },
      {
        heading: 'You Are Rebuilding',
        body: `During this program, you are rebuilding:

- **Your relationship with food** — learning to eat for fuel, not emotion
- **Your metabolism** — resetting the biological systems that drive weight gain
- **Your daily routine** — creating habits that support your health long-term

These changes last far beyond any individual dose of medication.`,
      },
      {
        heading: 'After Weight Loss',
        body: `Once you reach your goal, options may include:

- **Maintenance dosing** — a lower dose to sustain your results
- **Gradual tapering** — slowly reducing medication with close monitoring
- **Continued lifestyle support** — coaching, check-ins, and nutritional guidance

Your provider will work with you to create a personalized long-term plan. The goal is not lifelong medication dependency — it's sustainable health.`,
      },
    ],
  },
  {
    id: 'red-flags',
    number: 11,
    title: 'Red Flags — When to Act Fast',
    subsections: [
      {
        heading: 'Contact Your Provider Immediately',
        body: `While serious complications are rare, contact your provider right away if you experience:

- **Severe abdominal pain** — especially in the upper abdomen (could indicate pancreatitis)
- **Persistent vomiting** — unable to keep food or liquids down for more than 24 hours
- **Signs of dehydration** — dark urine, dizziness, rapid heartbeat, dry mouth
- **Severe allergic reaction** — rash, hives, swelling of face/lips/tongue, difficulty breathing

**Seek emergency care for:** difficulty breathing, severe allergic reaction, or intense abdominal pain with vomiting.

Don't wait or try to push through these symptoms. Early intervention prevents complications.`,
      },
    ],
  },
  {
    id: 'support-system',
    number: 12,
    title: 'Your Support System',
    subsections: [
      {
        heading: 'You Are Not Doing This Alone',
        body: `Your program includes a complete support team:

- **Medical providers** — overseeing your treatment and adjusting your plan
- **Success coaches** — guiding you through lifestyle changes
- **Ongoing monitoring** — regular check-ins to track your progress
- **Dose optimization** — ensuring your medication is working effectively

Reach out to your team whenever you have questions, concerns, or need encouragement. That's what they're here for.`,
      },
    ],
  },
  {
    id: 'faq',
    number: 13,
    title: 'Frequently Asked Questions',
    subsections: [
      {
        heading: 'Can I drink alcohol?',
        body: `Limit alcohol consumption while on GLP-1 medication. Alcohol increases the risk of nausea, can worsen dehydration, adds empty calories, and can slow your weight loss progress. If you do drink, do so in moderation and stay well hydrated.`,
      },
      {
        heading: 'What if I\'m not losing weight?',
        body: `If your weight loss has stalled, work through this checklist:

- **Review your diet** — are you eating enough protein? Are processed foods creeping back in?
- **Check your hydration** — are you drinking 64+ oz of water daily?
- **Increase activity** — even small increases in movement can help
- **Evaluate your dose with your provider** — you may need an adjustment

Plateaus are normal, but persistent stalls should be discussed with your care team.`,
      },
      {
        heading: 'Can I travel with my medication?',
        body: `Yes. Keep your medication temperature controlled during travel:

- Use an insulated travel case with cold packs
- Do not put medication in checked luggage (temperature extremes in the cargo hold)
- Carry a copy of your prescription for TSA/airport security
- If traveling internationally, check local regulations about carrying injectable medication`,
      },
      {
        heading: 'How long should I stay on the medication?',
        body: `This depends on your individual goals, progress, and provider recommendations. Research shows that longer treatment duration is associated with better long-term weight maintenance.

Your provider will work with you to determine the optimal duration and develop a plan for what comes after — whether that's a maintenance dose, gradual tapering, or lifestyle-only management.`,
      },
    ],
  },
  {
    id: 'final-message',
    number: 14,
    title: 'Final Message',
    subsections: [
      {
        heading: 'This Program Works — If You Work With It',
        body: `You will feel less hungry. You will think less about food. You will build a new lifestyle.

The medication gives you the biological advantage. The habits you build give you the lasting results.

**You're not just losing weight. You're upgrading your entire system.**`,
      },
    ],
  },
];

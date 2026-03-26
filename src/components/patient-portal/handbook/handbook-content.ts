export interface HandbookSubsection {
  heading: string;
  body: string;
  callout?: string;
}

export interface HandbookSection {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
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
    subtitle: 'What makes medically guided weight loss different from dieting',
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
        callout:
          'This program targets the biology of weight gain. It works with your body, not against it.',
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

- Hunger hormones increase after calorie restriction
- Metabolism slows to conserve energy
- Cravings intensify as the body fights back

GLP-1 therapy corrects these imbalances, making weight loss more predictable, more sustainable, and less mentally exhausting.`,
      },
    ],
  },
  {
    id: 'realistic-timeline',
    number: 2,
    title: 'What to Expect',
    subtitle: 'A realistic timeline from your first dose to long-term results',
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
- Portion sizes naturally shrink`,
        callout:
          'Key shift: You stop thinking about food constantly. The mental burden of dieting begins to lift.',
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
    title: 'Dosing',
    subtitle: 'Why your dose increases gradually and what to expect at each step',
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
        callout:
          'More medication does not mean faster results. Trust the protocol.',
      },
    ],
  },
  {
    id: 'injection-mastery',
    number: 4,
    title: 'Injection Mastery',
    subtitle: 'Everything you need to know about self-injection technique',
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
    title: 'Side Effects',
    subtitle: 'What to expect, why it happens, and how to manage it',
    subsections: [
      {
        heading: 'Why Side Effects Happen',
        body: `Your digestive system is slowing down. This is intentional — it's how the medication reduces appetite and helps you eat less naturally.

Most side effects are a sign the medication is working, not that something is wrong.`,
        callout:
          'Side effects are a sign the medication is active, not that something is wrong.',
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
    id: 'food-and-digestion',
    number: 6,
    title: 'Side Effects & What You Eat',
    subtitle:
      'How GLP-1 medications change your digestion — and why food choices directly affect how you feel',
    subsections: [
      {
        heading: 'Your Digestion Is Different Now',
        body: `GLP-1 medications work by significantly slowing gastric emptying — the rate at which food leaves your stomach and moves through your digestive tract. This is the primary mechanism that reduces hunger and helps you eat less.

But it also means food stays in your stomach much longer than it used to. A meal that previously would have been digested in 2–3 hours may now take 4–6 hours or more. This fundamental change means the types of food you eat have a much bigger impact on how you feel.`,
        callout:
          'Food stays in your stomach 2–3x longer on GLP-1 medication. What you eat now directly determines how you feel.',
      },
      {
        heading: 'Why Certain Foods Cause Problems',
        body: `When digestion is slowed, foods that are hard to break down stay in your system even longer. This is why the same meal that was fine before you started medication may now cause nausea, bloating, cramping, or discomfort.

**High-fat foods** are the biggest trigger. Fat is already the slowest macronutrient to digest. Combine slow-digesting fat with medication-slowed gastric emptying, and food can sit in your stomach for many hours — leading to nausea, acid reflux, and a heavy uncomfortable feeling.

**Fried and greasy foods** are especially problematic. The combination of fat, oil, and heavy breading creates a dense mass that your slowed digestive system struggles to process. This is the single most common trigger for severe nausea on GLP-1 medications.

**Very large meals** overwhelm a digestive system that is now working at a slower pace. Eating until you feel "full" on this medication usually means you've already eaten too much — the delayed stomach emptying means your brain doesn't receive the "stop" signal as quickly as it used to.`,
      },
      {
        heading: 'The Food-Symptom Connection',
        body: `Understanding which foods commonly trigger which symptoms can help you make better choices:

**Nausea is most triggered by:**
- Fried foods (french fries, fried chicken, doughnuts)
- Very fatty meals (cheeseburgers, pizza, creamy pasta)
- Eating too much in one sitting
- Eating too quickly
- Rich desserts (ice cream, cake, pastries)

**Bloating and cramping are most triggered by:**
- Carbonated beverages (soda, sparkling water, beer)
- High-fiber foods eaten in large amounts without enough water
- Beans and legumes in large portions (especially early in treatment)
- Raw cruciferous vegetables in excess (broccoli, cauliflower, cabbage)
- Sugar alcohols in "sugar-free" products (sorbitol, xylitol, erythritol)

**Constipation is worsened by:**
- Low water intake (the most common cause)
- Low fiber intake
- Too much dairy or cheese
- Processed carbohydrates (white bread, crackers, rice)
- Sedentary behavior

**Acid reflux and heartburn are triggered by:**
- Spicy foods
- Citrus and tomato-based foods on an empty stomach
- Chocolate and coffee in excess
- Eating close to bedtime
- Large meals that keep the stomach full longer`,
      },
      {
        heading: 'Foods That Work With Your Medication',
        body: `Just as some foods make side effects worse, others actually help your digestion work smoothly with the medication:

**Best-tolerated foods on GLP-1:**
- Lean proteins (chicken, turkey, fish, eggs) — easy to digest, high satiety
- Cooked vegetables — gentler on the stomach than raw
- Complex carbs in moderate portions (sweet potato, quinoa, oatmeal)
- Soups and broth-based meals — hydrating and easy to digest
- Smooth textures (yogurt, hummus, pureed soups)

**Eating patterns that minimize side effects:**
- Eat slowly — take 20–30 minutes per meal minimum
- Stop at the first sign of satisfaction, not fullness
- Eat 4–5 smaller meals instead of 2–3 large ones
- Protein first, then vegetables, then carbs
- Wait at least 3–4 hours between substantial meals to allow your stomach to empty`,
        callout:
          'Eat protein first, then vegetables, then carbs. Stop at satisfaction, not fullness. These two rules prevent most side effects.',
      },
      {
        heading: 'The First 48 Hours After a Dose Increase',
        body: `Side effects tend to peak in the 24–48 hours after each dose increase. During this window, be especially careful with your food choices.

**Recommended approach after a dose increase:**
- Stick to bland, easy-to-digest foods for the first 2–3 days
- Eat smaller portions than usual
- Avoid fried, greasy, or heavy foods completely
- Stay well hydrated
- Ginger tea or ginger chews can help settle your stomach
- Don't test your limits with food — this is not the time to eat out at a restaurant

After your body adjusts (usually within a week), you can gradually return to your normal food choices while still following the general guidelines above.`,
      },
    ],
  },
  {
    id: 'nutrition',
    number: 7,
    title: 'Nutrition',
    subtitle: 'Eat less, but eat smarter — every bite matters more now',
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
        callout:
          'Aim for 0.7–1g of protein per pound of goal body weight. Eat it first at every meal.',
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
    number: 8,
    title: 'Hydration & Electrolytes',
    subtitle: 'Why water is even more important on GLP-1 medication',
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
    number: 9,
    title: 'Exercise',
    subtitle: 'A smart, sustainable approach — not extreme workouts',
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
    number: 10,
    title: 'Plateaus',
    subtitle: 'Why weight loss stalls happen and what to do about them',
    subsections: [
      {
        heading: 'Weight Loss Is Not Linear',
        body: `Every patient experiences plateaus. The normal pattern is:

**Lose, stall, lose again.**

This is not a sign the medication stopped working. It's a sign your body is adjusting.`,
        callout:
          'Plateaus are a normal part of the process. The patients who get the best results are the ones who stay steady.',
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
- **Trust the process** — plateaus typically resolve within 1–3 weeks`,
      },
    ],
  },
  {
    id: 'long-term-success',
    number: 11,
    title: 'Long-Term Success',
    subtitle: 'Medication helps you lose weight — habits keep it off',
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
    number: 12,
    title: 'Red Flags',
    subtitle: 'When to contact your provider immediately',
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
    number: 13,
    title: 'Your Support System',
    subtitle: 'You are not doing this alone',
    subsections: [
      {
        heading: 'Your Care Team',
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
    number: 14,
    title: 'Frequently Asked Questions',
    subtitle: 'Quick answers to the most common questions',
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
    number: 15,
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

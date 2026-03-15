export interface ArticleSection {
  heading: string;
  body: string;
}

export interface ArticleData {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  readTime: string;
  lastUpdated: string;
  sections: ArticleSection[];
  keyTakeaways: string[];
  disclaimer: string;
}

export const articles: Record<string, ArticleData> = {
  'understanding-glp1-medications': {
    slug: 'understanding-glp1-medications',
    title: 'Understanding GLP-1 Medications',
    subtitle:
      'A comprehensive guide to how Semaglutide, Tirzepatide, and other GLP-1 receptor agonists work for weight loss',
    category: 'Education',
    readTime: '8 min read',
    lastUpdated: 'March 2026',
    sections: [
      {
        heading: 'What Are GLP-1 Medications?',
        body: `GLP-1 receptor agonists (GLP-1 RAs) are a class of medications originally developed for type 2 diabetes that have proven highly effective for weight management. They mimic a natural hormone called glucagon-like peptide-1 (GLP-1) that your body produces after eating.

When you eat, your gut releases GLP-1 to signal your brain that you're full. GLP-1 medications amplify this effect, helping you feel satisfied with less food. The two most commonly prescribed GLP-1 RAs for weight loss are Semaglutide (brand names Ozempic and Wegovy) and Tirzepatide (brand names Mounjaro and Zepbound).`,
      },
      {
        heading: 'How Do They Work?',
        body: `GLP-1 medications work through several complementary mechanisms:

**Appetite regulation** — They act on GLP-1 receptors in the brain's hypothalamus, the area that controls hunger and satiety. This reduces appetite and helps you feel full sooner during meals and for longer after eating.

**Slowed gastric emptying** — These medications slow the rate at which food leaves your stomach, which extends the feeling of fullness and reduces the urge to snack between meals.

**Blood sugar stabilization** — By stimulating insulin release in response to food (not when fasting), GLP-1 RAs help prevent the blood sugar spikes and crashes that can trigger cravings and overeating.

**Reduced food reward signaling** — Emerging research suggests GLP-1 medications may also dampen the brain's reward response to highly palatable foods, making it easier to resist cravings for high-calorie foods.`,
      },
      {
        heading: 'Semaglutide vs. Tirzepatide',
        body: `Both medications are highly effective, but they differ in their mechanism:

**Semaglutide** targets only the GLP-1 receptor. In clinical trials (the STEP program), patients lost an average of 15–17% of their body weight over 68 weeks. It is administered as a once-weekly injection.

**Tirzepatide** is a dual-action medication targeting both GLP-1 and GIP (glucose-dependent insulinotropic polypeptide) receptors. By engaging two hormone pathways, it has shown even greater weight loss in trials — the SURMOUNT program demonstrated average weight loss of 20–26% of body weight over 72 weeks. It is also a once-weekly injection.

Your provider will recommend the medication best suited to your health profile, weight loss goals, and any other conditions you may have.`,
      },
      {
        heading: 'What to Expect When Starting',
        body: `GLP-1 medications follow a dose-escalation schedule, meaning you start at a low dose and gradually increase over several weeks. This approach minimizes side effects and allows your body to adjust.

**Weeks 1–4:** You'll start at the lowest dose. Many patients notice a mild reduction in appetite within the first few days. Some experience mild nausea, which typically resolves within the first week or two.

**Weeks 4–12:** Your dose will be gradually increased according to your treatment plan. Appetite reduction becomes more pronounced. Most patients report feeling full much sooner at meals and having fewer cravings.

**Months 3–6:** By this point, most patients have reached their target dose and are experiencing significant changes in eating habits. Weight loss typically accelerates during this period.

**6 months and beyond:** Continued steady weight loss toward your goal. Your provider may adjust your dose based on your progress and how you're responding to the medication.`,
      },
      {
        heading: 'Maximizing Your Results',
        body: `While GLP-1 medications are powerful tools, the best outcomes come from combining medication with lifestyle changes:

**Nutrition** — Focus on protein-rich meals to preserve lean muscle mass during weight loss. Aim for 25–30 grams of protein per meal. Eat slowly, stop when you feel satisfied (not overly full), and stay well hydrated.

**Physical activity** — Regular exercise, especially a combination of cardio and strength training, accelerates weight loss and improves body composition. Even 150 minutes of moderate activity per week makes a meaningful difference.

**Sleep and stress** — Poor sleep and chronic stress elevate cortisol, which promotes fat storage and increases cravings. Prioritize 7–9 hours of quality sleep and practice stress management.

**Consistency** — Take your injection on the same day each week, at roughly the same time. Set a reminder to help you stay on schedule.`,
      },
      {
        heading: 'How Long Will I Need to Take the Medication?',
        body: `GLP-1 medications are most effective as part of an ongoing treatment plan. Research shows that discontinuing the medication often leads to weight regain, because the biological mechanisms that drive hunger and fat storage are still present.

Your provider will work with you to determine the right long-term plan. For some patients, a lower maintenance dose is appropriate after reaching their goal weight. Others may benefit from continued treatment at their therapeutic dose.

The goal is not lifelong medication dependency — it's sustainable weight management. As you build healthy habits around nutrition, exercise, and lifestyle, you and your provider will regularly reassess what level of support you need.`,
      },
    ],
    keyTakeaways: [
      'GLP-1 medications mimic a natural gut hormone that regulates appetite and blood sugar',
      'Semaglutide and Tirzepatide are the two most common options, both given as weekly injections',
      'Doses are gradually increased over weeks to minimize side effects',
      'Best results come from combining medication with healthy eating, exercise, and good sleep habits',
      'Most patients see significant weight loss within 3–6 months of starting treatment',
      'Your provider will create a personalized plan for both active weight loss and long-term maintenance',
    ],
    disclaimer:
      'This article is for educational purposes only and does not constitute medical advice. Always follow your provider\'s specific instructions regarding your medication, dosage, and treatment plan.',
  },

  'managing-side-effects': {
    slug: 'managing-side-effects',
    title: 'Managing Side Effects',
    subtitle:
      'Practical tips for handling common side effects of GLP-1 weight loss medications and when to contact your provider',
    category: 'Wellness',
    readTime: '7 min read',
    lastUpdated: 'March 2026',
    sections: [
      {
        heading: 'Side Effects Are Normal — and Usually Temporary',
        body: `If you're experiencing side effects from your GLP-1 medication, you're not alone. The most common side effects are gastrointestinal and tend to be most noticeable during the first few weeks of treatment or after a dose increase.

The good news is that for most patients, these side effects are mild to moderate and improve significantly as your body adjusts. Understanding what to expect and having strategies ready can make a big difference in your comfort during the adjustment period.`,
      },
      {
        heading: 'Nausea',
        body: `Nausea is the most commonly reported side effect, affecting roughly 40–50% of patients. It typically peaks during the first 1–2 weeks at each new dose level and then subsides.

**What helps:**
- Eat smaller, more frequent meals instead of large portions — your medication is already reducing your appetite, so smaller meals will feel more comfortable
- Avoid greasy, fried, or very rich foods, which are harder to digest
- Eat slowly and stop at the first sign of fullness — overeating on GLP-1 medication almost always triggers nausea
- Keep bland, easy-to-digest snacks on hand (crackers, toast, plain rice, bananas)
- Ginger tea, ginger chews, or ginger ale can provide natural relief
- Take your injection in the evening so the peak medication effect occurs while you sleep
- Stay hydrated — dehydration worsens nausea. Sip water throughout the day`,
      },
      {
        heading: 'Constipation',
        body: `Because GLP-1 medications slow gastric emptying (part of how they work), constipation is common, especially early in treatment.

**What helps:**
- Increase your fiber intake gradually — fruits, vegetables, whole grains, and legumes all help
- Drink plenty of water (aim for at least 64 oz per day). Fiber without adequate water can actually worsen constipation
- Stay physically active — even a daily 20-minute walk stimulates bowel motility
- Consider a gentle over-the-counter fiber supplement like psyllium husk (Metamucil) or polyethylene glycol (MiraLAX) if dietary changes aren't enough
- Establish a consistent bathroom routine — your body responds to regularity
- Prunes, prune juice, kiwi, and chia seeds are natural, mild laxatives`,
      },
      {
        heading: 'Diarrhea',
        body: `Some patients experience diarrhea, particularly during the dose-escalation phase. It often alternates with or replaces constipation as the body adjusts.

**What helps:**
- Stay hydrated — diarrhea can cause dehydration quickly. Electrolyte drinks or broth can help replace lost minerals
- Follow the BRAT diet during flare-ups: Bananas, Rice, Applesauce, Toast
- Temporarily reduce high-fiber, high-fat, and spicy foods until symptoms settle
- Avoid sugar alcohols (sorbitol, xylitol, erythritol) found in many sugar-free products, as they can worsen diarrhea
- Probiotics (yogurt, kefir, or supplements) may help restore gut balance
- If diarrhea persists for more than a few days, contact your provider`,
      },
      {
        heading: 'Stomach Pain and Bloating',
        body: `Abdominal discomfort, cramping, and bloating can occur as your digestive system adapts to slower gastric emptying.

**What helps:**
- Eat smaller meals and chew food thoroughly — large, quickly-eaten meals are the most common trigger
- Avoid carbonated beverages, which introduce extra gas
- Take a gentle walk after meals to aid digestion
- Peppermint tea may help relieve bloating and cramping
- Avoid lying down immediately after eating — stay upright for at least 30 minutes
- A warm compress on your abdomen can provide temporary relief
- Gas-reducing supplements like simethicone (Gas-X) are safe to use with GLP-1 medications`,
      },
      {
        heading: 'Fatigue and Low Energy',
        body: `Some patients report feeling more tired than usual, particularly during the early weeks. This can be related to reduced caloric intake as your appetite decreases.

**What helps:**
- Make sure you're eating enough protein (at least 60–80 grams per day) — inadequate protein during weight loss can cause fatigue and muscle loss
- Don't skip meals just because your appetite is lower. Eat nutrient-dense foods even when you're not very hungry
- Stay hydrated — even mild dehydration causes fatigue
- Maintain a regular sleep schedule with 7–9 hours per night
- Light exercise (walking, yoga, swimming) can actually boost energy levels even when you feel tired
- If fatigue is severe or doesn't improve after 2–3 weeks, contact your provider — it may indicate you need nutritional support`,
      },
      {
        heading: 'Injection Site Reactions',
        body: `Mild redness, swelling, or itching at the injection site occurs in a small percentage of patients and is almost always harmless.

**What helps:**
- Rotate your injection site each week — alternate between your abdomen, thigh, and upper arm
- Allow the medication to reach room temperature before injecting (take it out of the refrigerator 15–30 minutes ahead)
- Clean the injection site with an alcohol swab and let it dry completely before injecting
- After injecting, do not rub the site — gentle pressure with a clean cotton ball is fine
- If you notice persistent lumps, severe redness spreading beyond the injection site, or signs of infection, contact your provider`,
      },
      {
        heading: 'When to Contact Your Provider',
        body: `While most side effects are manageable at home, certain symptoms warrant prompt medical attention:

**Contact your provider if you experience:**
- Severe, persistent nausea or vomiting that prevents you from keeping food or liquids down for more than 24 hours
- Signs of dehydration: dark urine, dizziness, rapid heartbeat, dry mouth
- Severe abdominal pain that doesn't improve, especially if localized to the upper abdomen (could indicate pancreatitis)
- Signs of an allergic reaction: rash, hives, swelling of face/lips/tongue, difficulty breathing
- Persistent diarrhea lasting more than 3 days
- Symptoms of gallbladder problems: sudden severe pain in the upper right abdomen, pain between shoulder blades, or yellowing of skin/eyes
- Significant mood changes or persistent fatigue that interferes with daily activities
- Any symptom that feels unusual or concerning to you

**Seek emergency care for:** difficulty breathing, severe allergic reaction, or intense abdominal pain with vomiting.

Don't hesitate to reach out to your care team — we'd always rather hear from you early than have you suffer through something that has a simple solution.`,
      },
    ],
    keyTakeaways: [
      'Most GI side effects (nausea, constipation, diarrhea) are temporary and improve within 2–4 weeks',
      'Eating smaller meals, staying hydrated, and increasing fiber are the most effective management strategies',
      'Never skip meals — eat nutrient-dense, protein-rich food even when appetite is low',
      'Rotate injection sites weekly and allow medication to reach room temperature before injecting',
      'Contact your provider for severe or persistent symptoms — early intervention prevents complications',
      'Side effects often lessen with each dose increase as your body builds tolerance',
    ],
    disclaimer:
      'This article is for educational purposes only and does not replace your provider\'s medical advice. If you are experiencing severe side effects, contact your healthcare provider or seek emergency care immediately.',
  },
};

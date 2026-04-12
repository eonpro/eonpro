/**
 * WellMedR Full Intake Form — Mirrors the Fillout form at
 * onboarding-intake.wellmedr.com/t/jEhmSK8yPTus
 *
 * 36-screen intake matching the exact Fillout UI/UX:
 * BMI -> Goal Weight -> Sex -> DOB -> Health Effects -> Goals -> Animated Chart
 * -> Safety -> Metabolic Chart -> Motivation -> Pace -> Pattern Info -> Sleep
 * -> Testimonials -> Contraindications -> Health Conditions -> GLP-1 History
 * -> More Testimonials -> Opioids -> Surgeries -> Blood Pressure -> Heart Rate
 * -> Medication Priority -> Current Meds -> Motivation Level -> Anything Else
 * -> Congrats/Checkout -> Medical Review -> Contact Info -> (conditional GLP-1 Type)
 * -> Redirect to checkout
 *
 * English-only. WellMedR design: #0C2631 primary, #7B95A9 accent, #F7F7F9 bg.
 */

import type { FormConfig, FormStep, FieldOption } from '../types/form-engine';
import { US_STATE_OPTIONS } from '@/lib/usStates';

const stateOptions: FieldOption[] = US_STATE_OPTIONS.map((s) => ({
  id: s.value, label: { en: s.label, es: s.label }, value: s.value,
}));

const heightFeetOptions: FieldOption[] = [4, 5, 6, 7].map((ft) => ({
  id: `${ft}`, label: { en: `${ft}`, es: `${ft}` }, value: `${ft}`,
}));

const heightInchesOptions: FieldOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `${i}`, label: { en: `${i}`, es: `${i}` }, value: `${i}`,
}));

const steps: FormStep[] = [
  // 1. BMI Calculator
  {
    id: 'bmi-calc', path: 'bmi-calc',
    title: { en: "Let\u2019s calculate your BMI.", es: "Let\u2019s calculate your BMI." },
    subtitle: { en: 'Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.', es: '' },
    type: 'custom', component: 'WmBmiCalcStep',
    fields: [
      { id: 'current_weight', type: 'number', label: { en: 'Weight (lbs)', es: 'Weight (lbs)' }, storageKey: 'current_weight', placeholder: { en: '200', es: '200' }, validation: [{ type: 'required', message: { en: 'Please enter your weight', es: '' } }] },
      { id: 'height_feet', type: 'select', label: { en: 'Feet', es: 'Feet' }, storageKey: 'height_feet', options: heightFeetOptions, validation: [{ type: 'required', message: { en: 'Required', es: '' } }] },
      { id: 'height_inches', type: 'select', label: { en: 'Inches', es: 'Inches' }, storageKey: 'height_inches', options: heightInchesOptions },
    ],
    autoAdvance: false, showContinueButton: true, nextStep: 'goal-weight', prevStep: null, progressPercent: 3,
  },

  // 2. Goal Weight
  {
    id: 'goal-weight', path: 'goal-weight',
    title: { en: 'What is your goal weight?', es: '' },
    type: 'custom', component: 'WmGoalWeightStep',
    fields: [],
    autoAdvance: false, showContinueButton: false, nextStep: 'sex', prevStep: 'bmi-calc', progressPercent: 6,
  },

  // 3. Sex Selection (image cards)
  {
    id: 'sex', path: 'sex',
    title: { en: 'Are you male or female?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [],
    autoAdvance: false, showContinueButton: false, nextStep: 'dob', prevStep: 'goal-weight', progressPercent: 9,
    props: {
      headerText: "so let's get to know you a little better.",
      headerItalic: 'Medication can be tailored to your unique needs,',
      question: 'Are you male or female?',
      subtitle: 'This helps us understand your body complexity and hormones so we can assess you better.',
      storageKey: 'sex',
      columns: 2,
      mode: 'single',
      cards: [
        { id: 'male', label: 'Male', iconId: 'male' },
        { id: 'female', label: 'Female', iconId: 'female' },
      ],
    },
  },

  // 4. Date of Birth
  {
    id: 'dob', path: 'dob',
    title: { en: 'What is your date of birth?', es: '' },
    type: 'custom', component: 'WmDobStep',
    fields: [],
    autoAdvance: false, showContinueButton: false, nextStep: 'health-effects', prevStep: 'sex', progressPercent: 12,
  },

  // 5. Health Effects (image cards)
  {
    id: 'health-effects', path: 'health-effects',
    title: { en: 'Do you experience any of the following?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'goals-priority', prevStep: 'dob', progressPercent: 15,
    props: {
      headerItalic: 'gender-text',
      headerText: 'experience unique effects from weight gain.',
      question: 'Do you experience any of the following?',
      storageKey: 'health_effects',
      columns: 2, mode: 'multi',
      cards: [
        { id: 'low_libido', label: 'Low libido', iconId: 'low_libido' },
        { id: 'hair_loss', label: 'Hair loss', iconId: 'hair_loss' },
        { id: 'skin_issues', label: 'Skin issues', iconId: 'skin_issues' },
        { id: 'cognition_issues', label: 'Cognition issues', iconId: 'cognition' },
        { id: 'none', label: 'None of these', iconId: 'ok_hand' },
      ],
    },
  },

  // 6. Goals Priority (image cards)
  {
    id: 'goals-priority', path: 'goals-priority',
    title: { en: 'Which of these is most important to you?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'weight-chart', prevStep: 'health-effects', progressPercent: 18,
    props: {
      headerText: 'We can help with all of these, but choose the',
      headerItalic: 'most important for you.',
      question: 'Which of these is most important to you?',
      storageKey: 'goals_priority',
      columns: 2, mode: 'single',
      cards: [
        { id: 'lose_weight', label: 'Lose weight', iconId: 'lose_weight' },
        { id: 'gain_muscle', label: 'Gain muscle', iconId: 'gain_muscle' },
        { id: 'maintain', label: 'Maintain my current body', iconId: 'ok_hand' },
      ],
    },
  },

  // 7. Animated Weight Loss Chart
  {
    id: 'weight-chart', path: 'weight-chart',
    title: { en: "It feels like magic, but it's metabolic science.", es: '' },
    type: 'custom', component: 'WmAnimatedWeightChartStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'weight-chart-testimonial', prevStep: 'goals-priority', progressPercent: 21,
  },

  // 7b. Testimonial (Kelly)
  {
    id: 'weight-chart-testimonial', path: 'weight-chart-testimonial',
    title: { en: '', es: '' },
    type: 'custom', component: 'WmTestimonialStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'metabolic-chart', prevStep: 'weight-chart', progressPercent: 22,
    props: {
      quote: 'Nothing has worked like this. I am down 65lbs in 6 months. I have more energy and confidence than I\'ve had in years!',
      personName: 'Kelly',
      lostAmount: '65lbs in 6 months',
      beforeImage: '/assets/images/testimonials/2-before.webp',
      afterImage: '/assets/images/testimonials/2-after.webp',
      combinedImage: '/assets/images/testimonials/kelly-before-after.png',
      descriptionHtml: 'Kelly <strong>dropped</strong> his blood pressure and <em><u>upped</u></em> his confidence in only 5 weeks!',
    },
  },

  // 7c. GLP-1 Metabolic Rate Chart
  {
    id: 'metabolic-chart', path: 'metabolic-chart',
    title: { en: 'How will GLP-1 work for you?', es: '' },
    type: 'custom', component: 'WmMetabolicChartStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'safety-pregnancy', prevStep: 'weight-chart-testimonial', progressPercent: 23,
  },

  // 8. Safety / Pregnancy
  {
    id: 'safety-pregnancy', path: 'safety-pregnancy',
    title: { en: 'Do any of these apply to you?', es: '' },
    type: 'custom', component: 'WmCheckboxListStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'motivation-reason', prevStep: 'metabolic-chart', progressPercent: 24,
    props: {
      headerItalic: 'Safety, first.',
      question: 'Do any of these apply to you?',
      storageKey: 'safety_pregnancy',
      noneOptionId: 'none',
      options: [
        { id: 'none', label: 'None of the below' },
        { id: 'pregnant', label: 'Currently or possibly pregnant, or actively trying to become pregnant' },
        { id: 'breastfeeding', label: 'Breastfeeding or bottle-feeding with breastmilk' },
        { id: 'gave_birth', label: 'Have given birth to a child within the last 6 months' },
      ],
    },
  },

  // 10. Motivation / Primary Reason
  {
    id: 'motivation-reason', path: 'motivation-reason',
    title: { en: 'What is your primary reason for taking weight loss seriously?', es: '' },
    type: 'custom', component: 'WmMotivationRadioStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'pattern-info', prevStep: 'weight-pace', progressPercent: 33,
    props: {
      headerText: 'Improving your life requires',
      headerItalic: 'motivation.',
      question: 'What is your primary reason for taking weight loss seriously?',
      storageKey: 'motivation_reason',
      options: [
        { id: 'live_longer', label: 'I want to live longer' },
        { id: 'feel_better', label: 'I want to feel and look better' },
        { id: 'reduce_health', label: 'I want to reduce current health issues' },
        { id: 'all', label: 'All of these' },
      ],
    },
  },

  // 11. Weight Loss Pace (image cards)
  {
    id: 'weight-pace', path: 'weight-pace',
    title: { en: 'How is that pace for you?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'motivation-reason', prevStep: 'safety-pregnancy', progressPercent: 30,
    props: {
      headerText: "With medication, you'll lose 3.75 to 5 pounds per week.",
      question: 'How is that pace for you?',
      storageKey: 'weight_pace',
      columns: 2, mode: 'single',
      cards: [
        { id: 'works_for_me', label: 'That works for me' },
        { id: 'want_faster', label: 'I want it faster' },
        { id: 'too_fast', label: "That's too fast" },
      ],
    },
  },

  // 12. Pattern Info Card
  {
    id: 'pattern-info', path: 'pattern-info',
    title: { en: 'Losing weight is easier than you think.', es: '' },
    type: 'custom', component: 'WmPatternInfoStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'sleep-quality', prevStep: 'motivation-reason', progressPercent: 36,
  },

  // 13. Sleep Quality (image cards)
  {
    id: 'sleep-quality', path: 'sleep-quality',
    title: { en: 'How is your sleep, overall?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'testimonial-1', prevStep: 'pattern-info', progressPercent: 39,
    props: {
      headerText: 'How you sleep tells us a lot about your',
      headerItalic: 'cortisol and efficiency.',
      question: 'How is your sleep, overall?',
      storageKey: 'sleep_quality',
      columns: 2, mode: 'single',
      cards: [
        { id: 'pretty_good', label: 'Pretty good' },
        { id: 'restless', label: 'A bit restless' },
        { id: 'dont_sleep_well', label: "I don't sleep well" },
      ],
    },
  },

  // 14. Testimonial: Leilani
  {
    id: 'testimonial-1', path: 'testimonial-1',
    title: { en: '', es: '' },
    type: 'custom', component: 'WmTestimonialStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'contraindications', prevStep: 'sleep-quality', progressPercent: 42,
    props: {
      quote: 'I am so shocked that this actually works! Nothing I have ever tried worked for me. I am so happy thanks to Wellmedr.',
      personName: 'Leilani',
      lostAmount: '80lbs',
      beforeImage: '/assets/images/testimonials/1-before.webp',
      afterImage: '/assets/images/testimonials/1-after.webp',
      combinedImage: '/assets/images/testimonials/IMG_2962.JPG',
      descriptionHtml: 'Leilani went from <strong>beautiful</strong> to <strong>stunning</strong> and is currently <em><u>down</u></em> 80lbs!',
    },
  },

  // 15. GLP-1 Contraindications
  {
    id: 'contraindications', path: 'contraindications',
    title: { en: 'Do you have any conditions that may prevent GLP-1 use?', es: '' },
    type: 'custom', component: 'WmCheckboxListStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'health-conditions', prevStep: 'testimonial-1', progressPercent: 45,
    props: {
      headerItalic: 'GLP-1 is safe,',
      headerText: 'but these health conditions might prevent you from being prescribed.',
      subtitleText: 'Your answers are completely confidential and protected by HIPAA',
      question: 'Do you have any conditions that may prevent GLP-1 use?',
      storageKey: 'contraindications',
      noneOptionId: 'none',
      options: [
        { id: 'none', label: 'None of these' },
        { id: 'kidney_endstage', label: 'End-stage kidney disease (on or about to be on dialysis)' },
        { id: 'liver_endstage', label: 'End-stage liver disease (cirrhosis)' },
        { id: 'suicidal', label: 'Current suicidal thoughts and/or prior suicidal attempt' },
        { id: 'cancer', label: 'Cancer (active diagnosis, active treatment, or in remission or cancer-free for less than 5 continuous years)' },
        { id: 'organ_transplant', label: 'History of organ transplant or anti-rejection medication' },
        { id: 'severe_gi', label: 'Severe gastrointestinal condition (gastroparesis, blockage, inflammatory bowel disease)' },
        { id: 'substance_use', label: 'Current diagnosis of or treatment for alcohol, opioid, or substance use disorder/dependence' },
      ],
    },
  },

  // 16. Health Conditions (long list)
  {
    id: 'health-conditions', path: 'health-conditions',
    title: { en: 'Do any of these apply to you?', es: '' },
    type: 'custom', component: 'WmCheckboxListStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'glp1-history', prevStep: 'contraindications', progressPercent: 48,
    props: {
      headerItalic: 'A few more health questions.',
      question: 'Do any of these apply to you?',
      storageKey: 'health_conditions',
      noneOptionId: 'none',
      options: [
        { id: 'none', label: 'None of these' },
        { id: 'gallbladder', label: 'Gallbladder disease' },
        { id: 'hypertension', label: 'Hypertension (high blood pressure)' },
        { id: 'seizures', label: 'Seizures' },
        { id: 'glaucoma', label: 'Glaucoma' },
        { id: 'sleep_apnea', label: 'Sleep apnea' },
        { id: 'type2_no_insulin', label: 'Type 2 diabetes (not on insulin)' },
        { id: 'type2_insulin', label: 'Type 2 diabetes (on insulin)' },
        { id: 'type1', label: 'Type 1 diabetes' },
        { id: 'diabetic_retinopathy', label: 'Diabetic retinopathy, damage to the optic nerve from trauma or reduced blood flow, or blindness' },
        { id: 'warfarin', label: 'Use of the blood thinner warfarin (Coumadin/Jantoven)' },
        { id: 'pancreatitis', label: 'History of or current pancreatitis' },
        { id: 'thyroid', label: 'Personal or family history of thyroid cyst/nodule, thyroid cancer, medullary thyroid carcinoma, or MEN type 2' },
        { id: 'gout', label: 'Gout' },
        { id: 'high_cholesterol', label: 'High cholesterol or triglycerides' },
        { id: 'depression', label: 'Depression' },
        { id: 'head_injury', label: 'Head injury' },
        { id: 'brain_tumor', label: 'Tumor/infection in brain/spinal cord' },
        { id: 'low_sodium', label: 'Low sodium' },
        { id: 'liver_disease', label: 'Liver disease, including fatty liver' },
        { id: 'kidney_disease', label: 'Kidney disease' },
        { id: 'tachycardia', label: 'Elevated resting heart rate (tachycardia)' },
        { id: 'coronary', label: 'Coronary artery disease or heart attack/stroke in last 2 years' },
        { id: 'medication_allergy', label: 'Allergic to any medication' },
        { id: 'heart_failure', label: 'Congestive heart failure' },
        { id: 'qt_prolongation', label: 'QT prolongation or other heart rhythm disorder' },
        { id: 'hospitalization', label: 'Hospitalization within the last 1 year' },
        { id: 'hiv', label: 'Human immunodeficiency virus (HIV)' },
        { id: 'acid_reflux', label: 'Acid reflux' },
        { id: 'asthma', label: 'Asthma/reactive airway disease' },
        { id: 'incontinence', label: 'Urinary stress incontinence' },
        { id: 'pcos', label: 'Polycystic ovarian syndrome (PCOS)' },
        { id: 'low_testosterone', label: 'Clinically proven low testosterone' },
        { id: 'osteoarthritis', label: 'Osteoarthritis' },
        { id: 'constipation', label: 'Constipation' },
      ],
    },
  },

  // 17. GLP-1 Medication History
  {
    id: 'glp1-history', path: 'glp1-history',
    title: { en: 'Have you taken medication for weight loss within the past 4 weeks?', es: '' },
    type: 'single-select',
    fields: [{
      id: 'glp1_history_recent', type: 'radio',
      label: { en: 'GLP-1 History', es: '' }, storageKey: 'glp1_history_recent',
      options: [
        { id: 'yes', label: { en: "Yes, I've taken GLP-1 medication", es: '' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: '' }, value: 'no' },
      ],
    }],
    autoAdvance: true, showContinueButton: false,
    nextStep: 'testimonial-2', prevStep: 'health-conditions', progressPercent: 51,
  },

  // 18. Testimonial: Kelly (65lbs)
  {
    id: 'testimonial-2', path: 'testimonial-2',
    title: { en: '', es: '' },
    type: 'custom', component: 'WmTestimonialStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'testimonial-3', prevStep: 'glp1-history', progressPercent: 54,
    props: {
      quote: 'Nothing has worked like this. I am down 65lbs in 6 months. I have more energy and confidence than I\'ve had in years!',
      personName: 'Kelly',
      lostAmount: '65lbs in 6 months',
      beforeImage: '/assets/images/testimonials/2-before.webp',
      afterImage: '/assets/images/testimonials/2-after.webp',
      combinedImage: '/assets/images/testimonials/kelly-before-after.png',
      descriptionHtml: 'Kelly <strong>dropped</strong> his blood pressure and <em><u>upped</u></em> his confidence in only 5 weeks!',
    },
  },

  // 19. Testimonial: Woman (26lbs in 3 months)
  {
    id: 'testimonial-3', path: 'testimonial-3',
    title: { en: '', es: '' },
    type: 'custom', component: 'WmTestimonialStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'opioids', prevStep: 'testimonial-2', progressPercent: 57,
    props: {
      quote: "Nothing has worked like this. I am down 26lbs in 3 months. I've never experienced anything like it. I have more energy and confidence than I've had in years!",
      personName: 'Patient',
      lostAmount: '26lbs in 3 months',
      beforeImage: '/assets/images/testimonials/1-before.webp',
      afterImage: '/assets/images/testimonials/1-after.webp',
      combinedImage: '/assets/images/testimonials/5b403111-fa42-4b2b-8fc4-54cd1bfa7d4e.jpg',
    },
  },

  // 20. Opioid / Street Drugs
  {
    id: 'opioids', path: 'opioids',
    title: { en: 'Have you taken any opioid pain meds or street drugs in the last 3 months?', es: '' },
    type: 'custom', component: 'WmYesNoDetailStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'surgeries', prevStep: 'testimonial-3', progressPercent: 60,
    props: {
      question: 'Have you taken any opioid pain meds or street drugs in the last 3 months?',
      detailPrompt: 'Please provide brief details.',
      storageKey: 'opioid_use',
      detailStorageKey: 'opioid_use_detail',
    },
  },

  // 21. Weight Loss Surgeries
  {
    id: 'surgeries', path: 'surgeries',
    title: { en: 'Have you had prior weight loss surgeries?', es: '' },
    type: 'custom', component: 'WmYesNoDetailStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'blood-pressure', prevStep: 'opioids', progressPercent: 63,
    props: {
      question: 'Have you had prior weight loss surgeries?',
      detailPrompt: 'Please provide brief details.',
      storageKey: 'prior_surgeries',
      detailStorageKey: 'prior_surgeries_detail',
    },
  },

  // 22. Blood Pressure
  {
    id: 'blood-pressure', path: 'blood-pressure',
    title: { en: 'What is your average blood pressure range?', es: '' },
    type: 'single-select',
    fields: [{
      id: 'blood_pressure', type: 'radio',
      label: { en: 'Blood Pressure', es: '' }, storageKey: 'blood_pressure',
      options: [
        { id: 'normal', label: { en: '<120/80 (Normal)', es: '' }, value: 'normal' },
        { id: 'elevated', label: { en: '120-129/<80 (Elevated)', es: '' }, value: 'elevated' },
        { id: 'high_stage1', label: { en: '130-139/80-89 (High Stage 1)', es: '' }, value: 'high_stage1' },
        { id: 'high_stage2', label: { en: '\u2265140/90 (High Stage 2)', es: '' }, value: 'high_stage2' },
        { id: 'not_sure', label: { en: "I'm not sure", es: '' }, value: 'not_sure' },
      ],
    }],
    autoAdvance: true, showContinueButton: false, nextStep: 'heart-rate', prevStep: 'surgeries', progressPercent: 66,
  },

  // 23. Resting Heart Rate
  {
    id: 'heart-rate', path: 'heart-rate',
    title: { en: 'How about your average resting heart rate?', es: '' },
    type: 'single-select',
    fields: [{
      id: 'heart_rate', type: 'radio',
      label: { en: 'Heart Rate', es: '' }, storageKey: 'heart_rate',
      options: [
        { id: 'slow', label: { en: '<60 beats per minute (Slow)', es: '' }, value: 'slow' },
        { id: 'normal', label: { en: '60-100 beats per minute (Normal)', es: '' }, value: 'normal' },
        { id: 'slightly_fast', label: { en: '101-110 beats per minute (Slightly Fast)', es: '' }, value: 'slightly_fast' },
        { id: 'fast', label: { en: '>110 beats per minute (Fast)', es: '' }, value: 'fast' },
        { id: 'not_sure', label: { en: "I'm not sure", es: '' }, value: 'not_sure' },
      ],
    }],
    autoAdvance: true, showContinueButton: false, nextStep: 'med-priority', prevStep: 'blood-pressure', progressPercent: 69,
  },

  // 24. Medication Priority (image cards)
  {
    id: 'med-priority', path: 'med-priority',
    title: { en: 'Which of these is most important to you?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'current-meds', prevStep: 'heart-rate', progressPercent: 72,
    props: {
      headerItalic: 'Looking good!',
      headerText: "Let's match you with the best medication.",
      question: 'Which of these is most important to you?',
      storageKey: 'med_priority',
      columns: 2, mode: 'single',
      cards: [
        { id: 'affordability', label: 'Affordability', subtitle: 'Lowest price' },
        { id: 'potency', label: 'Potency', subtitle: 'Stronger dose' },
      ],
    },
  },

  // 25. Current Medications
  {
    id: 'current-meds', path: 'current-meds',
    title: { en: 'Do you currently take any medications?', es: '' },
    type: 'custom', component: 'WmYesNoDetailStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'motivation-level', prevStep: 'med-priority', progressPercent: 75,
    props: {
      question: 'Do you currently take any medications?',
      detailPrompt: 'Please add some details about the current medicine you take.',
      storageKey: 'current_medications',
      detailStorageKey: 'current_medications_detail',
    },
  },

  // 26. Motivation Level (image cards with emojis)
  {
    id: 'motivation-level', path: 'motivation-level',
    title: { en: 'How motivated are you to reach your goal?', es: '' },
    type: 'custom', component: 'WmImageCardStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'anything-else', prevStep: 'current-meds', progressPercent: 78,
    props: {
      headerText: "Let's better understand your current",
      headerItalic: 'state of mind.',
      question: 'How motivated are you to reach your goal?',
      storageKey: 'motivation_level',
      columns: 2, mode: 'single',
      cards: [
        { id: 'ready', label: "I'm ready!" },
        { id: 'hopeful', label: "I'm feeling hopeful" },
        { id: 'cautious', label: "I'm cautious" },
      ],
    },
  },

  // 27. Anything Else
  {
    id: 'anything-else', path: 'anything-else',
    title: { en: 'Is there anything else our medical team should know?', es: '' },
    type: 'custom', component: 'WmYesNoDetailStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'congrats', prevStep: 'motivation-level', progressPercent: 81,
    props: {
      headerText: 'Wellmedr medical providers review every form within 2-4 hours.',
      question: 'Is there anything else our medical team should know?',
      detailPrompt: 'Provide details here. Please do not include urgent or emergency medical information.',
      storageKey: 'anything_else',
      detailStorageKey: 'anything_else_detail',
    },
  },

  // 28-32. Congrats + Next Steps + Testimonials + Guarantee (single scrollable page)
  {
    id: 'congrats', path: 'congrats',
    title: { en: "Congrats, you're in!", es: '' },
    type: 'custom', component: 'WmCongratsStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'medical-review', prevStep: 'anything-else', progressPercent: 88,
  },

  // 33. Medical Review + Name + State
  {
    id: 'medical-review', path: 'medical-review',
    title: { en: 'Your medical review', es: '' },
    type: 'custom', component: 'WmMedicalReviewStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'contact-info-wm', prevStep: 'congrats', progressPercent: 92,
  },

  // 34. Contact Info (email, phone, consent)
  {
    id: 'contact-info-wm', path: 'contact-info-wm',
    title: { en: 'How can you be reached?', es: '' },
    type: 'custom', component: 'WmContactInfoStep',
    fields: [], autoAdvance: false, showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'glp1_history_recent', operator: 'equals', value: 'yes' }], target: 'glp1-type-wm' },
      { conditions: [{ field: 'glp1_history_recent', operator: 'equals', value: 'no' }], target: 'wellmedr-checkout-redirect' },
    ],
    prevStep: 'medical-review', progressPercent: 95,
  },

  // 35. GLP-1 Type (conditional — only if Yes to #17)
  {
    id: 'glp1-type-wm', path: 'glp1-type-wm',
    title: { en: 'Which weight loss medication have you taken?', es: '' },
    type: 'custom', component: 'WmGlp1TypeStep',
    fields: [], autoAdvance: false, showContinueButton: false, nextStep: 'wellmedr-checkout-redirect', prevStep: 'contact-info-wm', progressPercent: 98,
  },

  // 36. Redirect to checkout
  {
    id: 'wellmedr-checkout-redirect', path: 'wellmedr-checkout-redirect',
    title: { en: 'Preparing your results...', es: '' },
    type: 'custom', component: 'FindingProviderStep',
    fields: [], autoAdvance: true, showContinueButton: false, nextStep: null, prevStep: 'contact-info-wm', progressPercent: 100,
  },
];

export const wellmedrIntakeConfig: FormConfig = {
  id: 'wellmedr-intake',
  name: 'WellMedR Full Intake',
  version: '4.0.0',
  description: 'Complete WellMedR intake — 36 screens matching the Fillout form UI/UX',
  treatmentType: 'weight-loss',
  steps,
  startStep: 'bmi-calc',
  languages: ['en'],
  defaultLanguage: 'en',
  integrations: [
    { type: 'platform', triggers: ['complete'] },
  ],
  branding: {
    logo: '/wellmedr-logo.svg',
    primaryColor: '#0C2631',
    accentColor: '#7B95A9',
    secondaryColor: '#F7F7F9',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

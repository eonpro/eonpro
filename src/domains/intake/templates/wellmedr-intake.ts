/**
 * WellMedR Short Intake Form — Mirrors the Fillout form at
 * onboarding-intake.wellmedr.com/t/jEhmSK8yPTus
 *
 * English-only. No language selection, no landing page.
 * Starts directly with BMI calculation.
 * Design: Outfit font, Bodoni italic accents, #0C2631 primary,
 * #7B95A9 question color, #F7F7F9 background.
 */

import type { FormConfig, FormStep, FieldOption } from '../types/form-engine';
import { US_STATE_OPTIONS } from '@/lib/usStates';

const stateOptions: FieldOption[] = US_STATE_OPTIONS.map((s) => ({
  id: s.value,
  label: { en: s.label, es: s.label },
  value: s.value,
}));

const heightFeetOptions: FieldOption[] = [4, 5, 6, 7].map((ft) => ({
  id: `${ft}`,
  label: { en: `${ft}`, es: `${ft}` },
  value: `${ft}`,
}));

const heightInchesOptions: FieldOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `${i}`,
  label: { en: `${i}`, es: `${i}` },
  value: `${i}`,
}));

const steps: FormStep[] = [
  {
    id: 'bmi-calc',
    path: 'bmi-calc',
    title: { en: "Let\u2019s calculate your BMI.", es: "Let\u2019s calculate your BMI." },
    subtitle: {
      en: 'Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.',
      es: 'Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.',
    },
    type: 'custom',
    component: 'WeightHeightStep',
    fields: [
      { id: 'current_weight', type: 'number', label: { en: 'Weight (lbs)', es: 'Weight (lbs)' }, storageKey: 'current_weight', placeholder: { en: '200', es: '200' }, validation: [{ type: 'required', message: { en: 'Please enter your weight', es: 'Please enter your weight' } }] },
      { id: 'height_feet', type: 'select', label: { en: 'Feet', es: 'Feet' }, storageKey: 'height_feet', options: heightFeetOptions, validation: [{ type: 'required', message: { en: 'Required', es: 'Required' } }] },
      { id: 'height_inches', type: 'select', label: { en: 'Inches', es: 'Inches' }, storageKey: 'height_inches', options: heightInchesOptions },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'goal-weight',
    prevStep: null,
    progressPercent: 0,
  },
  {
    id: 'goal-weight',
    path: 'goal-weight',
    title: { en: 'What is your goal weight?', es: 'What is your goal weight?' },
    type: 'custom',
    component: 'WeightInputStep',
    fields: [{
      id: 'ideal_weight', type: 'number',
      label: { en: 'Your goal weight (lbs)', es: 'Your goal weight (lbs)' },
      storageKey: 'ideal_weight',
      placeholder: { en: '150', es: '150' },
      validation: [{ type: 'required', message: { en: 'Please enter your goal weight', es: 'Please enter your goal weight' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'name',
    prevStep: 'bmi-calc',
    progressPercent: 14,
  },
  {
    id: 'name',
    path: 'name',
    title: { en: 'What is your name?', es: 'What is your name?' },
    type: 'input',
    fields: [
      { id: 'firstName', type: 'text', label: { en: 'First Name', es: 'First Name' }, placeholder: { en: 'First Name', es: 'First Name' }, storageKey: 'firstName', validation: [{ type: 'required', message: { en: 'First name is required', es: 'First name is required' } }] },
      { id: 'lastName', type: 'text', label: { en: 'Last Name', es: 'Last Name' }, placeholder: { en: 'Last Name', es: 'Last Name' }, storageKey: 'lastName', validation: [{ type: 'required', message: { en: 'Last name is required', es: 'Last name is required' } }] },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'email',
    prevStep: 'goal-weight',
    progressPercent: 28,
  },
  {
    id: 'email',
    path: 'email',
    title: { en: "What's your email?", es: "What's your email?" },
    type: 'input',
    fields: [{
      id: 'email', type: 'email',
      label: { en: 'Email', es: 'Email' },
      placeholder: { en: 'your@email.com', es: 'your@email.com' },
      storageKey: 'email',
      validation: [
        { type: 'required', message: { en: 'Email is required', es: 'Email is required' } },
        { type: 'email', message: { en: 'Please enter a valid email', es: 'Please enter a valid email' } },
      ],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'state',
    prevStep: 'name',
    progressPercent: 42,
  },
  {
    id: 'state',
    path: 'state',
    title: { en: 'What state will your medication be shipped to?', es: 'What state will your medication be shipped to?' },
    type: 'custom',
    component: 'StateSelectStep',
    fields: [{
      id: 'state', type: 'select',
      label: { en: 'State', es: 'State' },
      storageKey: 'state',
      options: stateOptions,
      validation: [{ type: 'required', message: { en: 'Please select a state', es: 'Please select a state' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'sex',
    prevStep: 'email',
    progressPercent: 57,
  },
  {
    id: 'sex',
    path: 'sex',
    title: { en: 'Are you male or female?', es: 'Are you male or female?' },
    type: 'single-select',
    fields: [{
      id: 'sex', type: 'radio',
      label: { en: 'Sex', es: 'Sex' },
      storageKey: 'sex',
      options: [
        { id: 'male', label: { en: 'Male', es: 'Male' }, value: 'male' },
        { id: 'female', label: { en: 'Female', es: 'Female' }, value: 'female' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'dob',
    prevStep: 'state',
    progressPercent: 71,
  },
  {
    id: 'dob',
    path: 'dob',
    title: { en: 'What is your date of birth?', es: 'What is your date of birth?' },
    type: 'custom',
    component: 'DateOfBirthStep',
    fields: [{
      id: 'dob', type: 'date',
      label: { en: 'Date of Birth', es: 'Date of Birth' },
      placeholder: { en: 'MM/DD/YYYY', es: 'MM/DD/YYYY' },
      storageKey: 'dob',
      validation: [
        { type: 'required', message: { en: 'Date of birth is required', es: 'Date of birth is required' } },
        { type: 'age', value: 18, message: { en: 'You must be at least 18 years old', es: 'You must be at least 18 years old' } },
      ],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'wellmedr-checkout-redirect',
    prevStep: 'sex',
    progressPercent: 85,
  },
  {
    id: 'wellmedr-checkout-redirect',
    path: 'wellmedr-checkout-redirect',
    title: { en: 'Preparing your results...', es: 'Preparing your results...' },
    type: 'custom',
    component: 'FindingProviderStep',
    fields: [],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: null,
    prevStep: 'dob',
    progressPercent: 100,
  },
];

export const wellmedrIntakeConfig: FormConfig = {
  id: 'wellmedr-intake',
  name: 'WellMedR Quick Intake',
  version: '3.0.0',
  description: 'Short intake form for WellMedR — English only, starts at BMI, redirects to checkout',
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

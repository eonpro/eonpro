/**
 * OT Mens Health TRT Intake Form — Testosterone Replacement Therapy
 *
 * TRT intake for ot.eonpro.io (Overtime Men's Health).
 * Evaluates symptoms, goals, prior testosterone use, and medical history
 * specific to Testosterone Replacement Therapy eligibility.
 * Ends with booking, same as the OT peptide flow.
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
  label: { en: `${ft} ft`, es: `${ft} pies` },
  value: `${ft}`,
}));

const heightInchesOptions: FieldOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `${i}`,
  label: { en: `${i} in`, es: `${i} pulg` },
  value: `${i}`,
}));

const steps: FormStep[] = [
  // ===== INTRO / LANDING =====
  {
    id: 'trt-intro',
    path: 'trt-intro',
    title: { en: 'Reclaim your energy, drive, and confidence.', es: 'Recupera tu energía, impulso y confianza.' },
    subtitle: { en: 'Clinically guided Testosterone Replacement Therapy.', es: 'Terapia de Reemplazo de Testosterona clínicamente guiada.' },
    type: 'custom',
    component: 'TRTLandingStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'symptoms',
    prevStep: null,
    progressPercent: 0,
  },

  // ===== SYMPTOMS ASSESSMENT =====
  {
    id: 'symptoms',
    path: 'symptoms',
    title: { en: 'Which of the following symptoms do you currently experience?', es: '¿Cuáles de los siguientes síntomas experimentas actualmente?' },
    type: 'multi-select',
    fields: [{
      id: 'trt_symptoms', type: 'checkbox',
      label: { en: 'Symptoms', es: 'Síntomas' },
      storageKey: 'trt_symptoms',
      options: [
        { id: 'fatigue_low_energy', label: { en: 'Fatigue or low energy', es: 'Fatiga o baja energía' }, value: 'fatigue_low_energy' },
        { id: 'low_libido', label: { en: 'Low libido or decreased sex drive', es: 'Libido bajo o disminución del deseo sexual' }, value: 'low_libido' },
        { id: 'erectile_dysfunction', label: { en: 'Erectile dysfunction', es: 'Disfunción eréctil' }, value: 'erectile_dysfunction' },
        { id: 'mood_changes', label: { en: 'Mood changes, irritability, or depression', es: 'Cambios de humor, irritabilidad o depresión' }, value: 'mood_changes' },
        { id: 'muscle_loss', label: { en: 'Loss of muscle mass or strength', es: 'Pérdida de masa muscular o fuerza' }, value: 'muscle_loss' },
        { id: 'body_fat', label: { en: 'Increased body fat or belly fat', es: 'Aumento de grasa corporal o abdominal' }, value: 'body_fat' },
        { id: 'brain_fog', label: { en: 'Brain fog or poor concentration', es: 'Niebla mental o poca concentración' }, value: 'brain_fog' },
        { id: 'sleep_problems', label: { en: 'Sleep problems or insomnia', es: 'Problemas de sueño o insomnio' }, value: 'sleep_problems' },
        { id: 'hair_thinning', label: { en: 'Hair thinning or loss', es: 'Adelgazamiento o pérdida de cabello' }, value: 'hair_thinning' },
        { id: 'hot_flashes', label: { en: 'Hot flashes or night sweats', es: 'Sofocos o sudores nocturnos' }, value: 'hot_flashes' },
      ],
      validation: [{ type: 'required', message: { en: 'Please select at least one symptom', es: 'Por favor selecciona al menos un síntoma' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'consent',
    prevStep: 'trt-intro',
    progressPercent: 3,
  },

  // ===== CONSENT =====
  {
    id: 'consent',
    path: 'consent',
    title: { en: 'Safe, clinically guided Peptide support', es: 'Apoyo peptídico seguro y clínicamente guiado' },
    subtitle: { en: 'Receive personalized clinical insights and lab recommendations tailored to your physiology, recovery patterns, and long-term wellness goals.', es: 'Recibe información clínica personalizada y recomendaciones de laboratorio adaptadas a tu fisiología, patrones de recuperación y objetivos de bienestar a largo plazo.' },
    type: 'custom',
    component: 'ConsentStep',
    fields: [{
      id: 'consent_accepted', type: 'checkbox',
      label: { en: 'I understand and agree', es: 'Entiendo y acepto' },
      storageKey: 'consent_accepted',
      validation: [{ type: 'required', message: { en: 'You must accept to continue', es: 'Debes aceptar para continuar' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'state',
    prevStep: 'symptoms',
    progressPercent: 5,
    props: {
      consentLinks: {
        terms: 'https://www.otmens.com/termsandconditions',
        privacy: 'https://www.otmens.com/privacypolicy',
        telehealth: 'https://www.otmens.com/telehealthconsent',
        cancellation: 'https://www.otmens.com/cancellationpolicy',
      },
    },
  },

  // ===== STATE =====
  {
    id: 'state',
    path: 'state',
    title: { en: 'Select the state you live in:', es: 'Selecciona el estado en el que vives:' },
    subtitle: { en: 'This is the state where your medication will be shipped, if prescribed.', es: 'Este es el estado donde se enviará tu medicamento, si se receta.' },
    type: 'custom',
    component: 'StateSelectStep',
    fields: [
      {
        id: 'state', type: 'select',
        label: { en: 'State', es: 'Estado' },
        storageKey: 'state',
        options: stateOptions,
        validation: [{ type: 'required', message: { en: 'Please select a state', es: 'Por favor selecciona un estado' } }],
      },
      {
        id: 'terms_accepted', type: 'checkbox',
        label: { en: 'I agree to the Terms and Conditions and Privacy Policy', es: 'Acepto los Términos y Condiciones y la Política de Privacidad' },
        storageKey: 'terms_accepted',
        validation: [{ type: 'required', message: { en: 'You must accept the terms', es: 'Debes aceptar los términos' } }],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'name',
    prevStep: 'consent',
    progressPercent: 8,
    props: {
      consentLinks: {
        terms: 'https://www.otmens.com/termsandconditions',
        privacy: 'https://www.otmens.com/privacypolicy',
      },
    },
  },

  // ===== NAME =====
  {
    id: 'name',
    path: 'name',
    title: { en: 'What is your name?', es: '¿Cuál es tu nombre?' },
    subtitle: { en: 'This way, we can personalize your experience from the very beginning.', es: 'De esta manera, podemos personalizar tu experiencia desde el inicio.' },
    type: 'input',
    fields: [
      { id: 'firstName', type: 'text', label: { en: 'First Name', es: 'Nombre' }, placeholder: { en: 'First Name', es: 'Nombre' }, storageKey: 'firstName', validation: [{ type: 'required', message: { en: 'First name is required', es: 'El nombre es requerido' } }] },
      { id: 'lastName', type: 'text', label: { en: 'Last Name', es: 'Apellido' }, placeholder: { en: 'Last Name', es: 'Apellido' }, storageKey: 'lastName', validation: [{ type: 'required', message: { en: 'Last name is required', es: 'El apellido es requerido' } }] },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'dob',
    prevStep: 'state',
    progressPercent: 11,
  },

  // ===== DATE OF BIRTH =====
  {
    id: 'dob',
    path: 'dob',
    title: { en: 'To check if you qualify, tell us your date of birth.', es: 'Para verificar si calificas, dinos tu fecha de nacimiento.' },
    subtitle: { en: 'This helps us confirm that you meet the age requirements for treatment.', es: 'Esto nos ayuda a confirmar que cumples con los requisitos de edad para el tratamiento.' },
    type: 'custom',
    component: 'DateOfBirthStep',
    fields: [{
      id: 'dob', type: 'date',
      label: { en: 'Date of Birth', es: 'Fecha de Nacimiento' },
      placeholder: { en: 'Date of Birth (Month/Day/Year)', es: 'Fecha de Nacimiento (Mes/Día/Año)' },
      storageKey: 'dob',
      validation: [
        { type: 'required', message: { en: 'Date of birth is required', es: 'La fecha de nacimiento es requerida' } },
        { type: 'age', value: 18, message: { en: 'You must be at least 18 years old', es: 'Debes tener al menos 18 años' } },
      ],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'support-info',
    prevStep: 'name',
    progressPercent: 13,
  },

  // ===== SUPPORT INFO =====
  {
    id: 'support-info',
    path: 'support-info',
    title: { en: 'Did you know that Overtime assigns a representative to your case to guide and support you every step of the way.', es: 'Sabías que Overtime asigna un representante a tu caso para guiarte y apoyarte en cada paso.' },
    subtitle: { en: "We know things can sometimes be confusing, which is why we're here to guide and support you.", es: 'Sabemos que las cosas a veces pueden ser confusas, por eso estamos aquí para guiarte y apoyarte.' },
    type: 'custom',
    component: 'SupportInfoStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'address',
    prevStep: 'dob',
    progressPercent: 16,
  },

  // ===== ADDRESS =====
  {
    id: 'address',
    path: 'address',
    title: { en: 'What is your home address?', es: '¿Cuál es tu dirección?' },
    subtitle: { en: 'We use your address to confirm that our services are available in your state and to meet local medical requirements.', es: 'Usamos tu dirección para confirmar que nuestros servicios están disponibles en tu estado y para cumplir con los requisitos médicos locales.' },
    type: 'custom',
    component: 'AddressStep',
    fields: [
      { id: 'street', type: 'text', label: { en: 'Address', es: 'Dirección' }, placeholder: { en: 'Address', es: 'Dirección' }, storageKey: 'street', validation: [{ type: 'required', message: { en: 'Address is required', es: 'La dirección es requerida' } }] },
      { id: 'apartment', type: 'text', label: { en: 'Apartment Number*', es: 'Número de Apartamento*' }, placeholder: { en: 'Apartment Number*', es: 'Número de Apartamento*' }, storageKey: 'apartment' },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'current-weight',
    prevStep: 'support-info',
    progressPercent: 18,
    props: {
      apartmentNote: { en: '*Only if applicable. Leave blank if you live in a house.', es: '*Solo si aplica. Dejar en blanco si vives en una casa.' },
    },
  },

  // ===== WEIGHT & HEIGHT =====
  {
    id: 'current-weight',
    path: 'current-weight',
    title: { en: 'What is your current weight?', es: '¿Cuál es tu peso actual?' },
    subtitle: { en: '*Numbers only. Example: if your current weight is 140 lbs, enter 140 in the box.', es: '*Solo números. Ejemplo: si tu peso actual es 140 lbs, ingresa 140 en la casilla.' },
    type: 'custom',
    component: 'WeightHeightStep',
    fields: [
      { id: 'current_weight', type: 'number', label: { en: 'Current Weight (lbs)', es: 'Peso Actual (lbs)' }, storageKey: 'current_weight', validation: [{ type: 'required', message: { en: 'Please enter your weight', es: 'Por favor ingresa tu peso' } }] },
      { id: 'height_feet', type: 'select', label: { en: 'Height (feet)', es: 'Altura (pies)' }, storageKey: 'height_feet', options: heightFeetOptions, validation: [{ type: 'required', message: { en: 'Please select feet', es: 'Por favor selecciona pies' } }] },
      { id: 'height_inches', type: 'select', label: { en: 'Height (inches)', es: 'Altura (pulgadas)' }, storageKey: 'height_inches', options: heightInchesOptions, validation: [{ type: 'required', message: { en: 'Please select inches', es: 'Por favor selecciona pulgadas' } }] },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'bmi-calculating',
    prevStep: 'address',
    progressPercent: 21,
  },

  // ===== BMI CALCULATING =====
  {
    id: 'bmi-calculating',
    path: 'bmi-calculating',
    title: { en: 'Calculating your BMI...', es: 'Calculando tu IMC...' },
    type: 'custom',
    component: 'BMICalculatingStep',
    fields: [],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'bmi-result',
    prevStep: 'current-weight',
    progressPercent: 24,
  },

  // ===== BMI RESULT =====
  {
    id: 'bmi-result',
    path: 'bmi-result',
    title: { en: 'Your BMI Result', es: 'Tu Resultado de IMC' },
    type: 'custom',
    component: 'BMIResultStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'contact-info',
    prevStep: 'current-weight',
    progressPercent: 26,
  },

  // ===== CONTACT INFO =====
  {
    id: 'contact-info',
    path: 'contact-info',
    title: { en: 'How can we contact you?', es: '¿Cómo podemos contactarte?' },
    subtitle: { en: 'We use this information to keep you informed about your treatment, send you important updates, and help you stay connected with your provider.', es: 'Usamos esta información para mantenerte informado sobre tu tratamiento, enviarte actualizaciones importantes y ayudarte a mantenerte conectado con tu proveedor.' },
    type: 'custom',
    component: 'ContactInfoStep',
    fields: [
      { id: 'email', type: 'email', label: { en: 'Email', es: 'Correo electrónico' }, placeholder: { en: 'Email', es: 'Correo electrónico' }, storageKey: 'email', validation: [{ type: 'required', message: { en: 'Email is required', es: 'El correo electrónico es requerido' } }, { type: 'email', message: { en: 'Please enter a valid email', es: 'Por favor ingresa un correo válido' } }] },
      { id: 'phone', type: 'phone', label: { en: 'Phone number', es: 'Número de teléfono' }, placeholder: { en: 'Phone number', es: 'Número de teléfono' }, storageKey: 'phone', validation: [{ type: 'required', message: { en: 'Phone number is required', es: 'El número de teléfono es requerido' } }, { type: 'phone', message: { en: 'Please enter a valid phone number', es: 'Por favor ingresa un número válido' } }] },
      { id: 'contact_consent', type: 'checkbox', label: { en: 'I accept the Privacy Policy and I authorize receiving important communications via email and text messages (SMS) from OT Mens / EONPro and affiliates regarding my treatment.', es: 'Acepto la Política de Privacidad y autorizo recibir comunicaciones importantes por correo electrónico y mensajes de texto (SMS) de OT Mens / EONPro y afiliados sobre mi tratamiento.' }, storageKey: 'contact_consent' },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'medical-history-overview',
    prevStep: 'current-weight',
    progressPercent: 29,
  },

  // ===== MEDICAL HISTORY SECTION =====
  {
    id: 'medical-history-overview',
    path: 'medical-history-overview',
    title: { en: 'Now, complete your medical history', es: 'Ahora, completa tu historial médico' },
    subtitle: { en: 'This information helps our providers create a safe, personalized plan.', es: 'Esta información ayuda a nuestros proveedores a crear un plan seguro y personalizado.' },
    type: 'custom',
    component: 'MedicalHistoryOverviewStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'gender',
    prevStep: 'contact-info',
    progressPercent: 32,
  },

  // ===== GENDER =====
  {
    id: 'gender',
    path: 'gender',
    title: { en: 'What is your gender?', es: '¿Cuál es tu género?' },
    subtitle: { en: 'This medical information helps us properly assess your eligibility and determine the most appropriate treatment.', es: 'Esta información médica nos ayuda a evaluar adecuadamente tu elegibilidad y determinar el tratamiento más apropiado.' },
    type: 'single-select',
    fields: [{
      id: 'sex', type: 'radio',
      label: { en: 'Gender', es: 'Género' },
      storageKey: 'sex',
      options: [
        { id: 'male', label: { en: 'Man', es: 'Hombre' }, value: 'male' },
        { id: 'female', label: { en: 'Woman', es: 'Mujer' }, value: 'female' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'trt-interest',
    prevStep: 'medical-history-overview',
    progressPercent: 34,
    props: {
      disclaimer: {
        en: "OT Mens provides medical care without discrimination. We do not discriminate based on sex, gender, gender identity, sexual orientation, age, race, color, religion, national origin, marital status, disability, or any other characteristic protected by law. Your privacy and dignity are a priority at all times.",
        es: "OT Mens brinda atención médica sin discriminación. No discriminamos por sexo, género, identidad de género, orientación sexual, edad, raza, color, religión, origen nacional, estado civil, discapacidad u otra característica protegida por la ley. Tu privacidad y dignidad son prioridad en todo momento.",
      },
    },
  },

  // ===== TRT INTEREST =====
  {
    id: 'trt-interest',
    path: 'trt-interest',
    title: { en: 'What brings you to Testosterone Replacement Therapy?', es: '¿Qué te trae a la Terapia de Reemplazo de Testosterona?' },
    type: 'single-select',
    fields: [{
      id: 'trt_interest', type: 'radio',
      label: { en: 'TRT Interest', es: 'Interés en TRT' },
      storageKey: 'trt_interest',
      options: [
        { id: 'low_energy', label: { en: 'I have low energy and want to feel like myself again', es: 'Tengo poca energía y quiero sentirme como antes' }, value: 'low_energy' },
        { id: 'low_libido', label: { en: "I'm experiencing low libido or sexual health concerns", es: 'Estoy experimentando libido bajo o preocupaciones de salud sexual' }, value: 'low_libido' },
        { id: 'doctor_recommended', label: { en: 'My doctor recommended I explore TRT', es: 'Mi médico me recomendó explorar TRT' }, value: 'doctor_recommended' },
        { id: 'switching_providers', label: { en: "I'm currently on TRT and looking for a new provider", es: 'Actualmente estoy en TRT y busco un nuevo proveedor' }, value: 'switching_providers' },
        { id: 'optimize_health', label: { en: 'I want to optimize my overall health and vitality', es: 'Quiero optimizar mi salud general y vitalidad' }, value: 'optimize_health' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'trt-goals',
    prevStep: 'gender',
    progressPercent: 37,
  },

  // ===== TRT GOALS =====
  {
    id: 'trt-goals',
    path: 'trt-goals',
    title: { en: 'What are your goals with TRT?', es: '¿Cuáles son tus objetivos con TRT?' },
    type: 'multi-select',
    fields: [{
      id: 'trt_goals', type: 'checkbox',
      label: { en: 'TRT Goals', es: 'Objetivos de TRT' },
      storageKey: 'trt_goals',
      options: [
        { id: 'energy_stamina', label: { en: 'Increased energy and stamina', es: 'Mayor energía y resistencia' }, value: 'energy_stamina' },
        { id: 'libido_performance', label: { en: 'Improved libido and sexual performance', es: 'Mejora del libido y rendimiento sexual' }, value: 'libido_performance' },
        { id: 'muscle_strength', label: { en: 'Muscle growth and strength', es: 'Crecimiento muscular y fuerza' }, value: 'muscle_strength' },
        { id: 'fat_loss', label: { en: 'Fat loss and body composition', es: 'Pérdida de grasa y composición corporal' }, value: 'fat_loss' },
        { id: 'mood_clarity', label: { en: 'Better mood and mental clarity', es: 'Mejor estado de ánimo y claridad mental' }, value: 'mood_clarity' },
        { id: 'focus_concentration', label: { en: 'Sharper focus and concentration', es: 'Mayor enfoque y concentración' }, value: 'focus_concentration' },
        { id: 'sleep_quality', label: { en: 'Improved sleep quality', es: 'Mejor calidad de sueño' }, value: 'sleep_quality' },
        { id: 'vitality_anti_aging', label: { en: 'Overall vitality and anti-aging', es: 'Vitalidad general y anti-envejecimiento' }, value: 'vitality_anti_aging' },
      ],
      validation: [{ type: 'required', message: { en: 'Please select at least one goal', es: 'Por favor selecciona al menos un objetivo' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'prior-testosterone',
    prevStep: 'trt-interest',
    progressPercent: 39,
  },

  // ===== PRIOR TESTOSTERONE USE =====
  {
    id: 'prior-testosterone',
    path: 'prior-testosterone',
    title: { en: 'Have you used testosterone therapy before?', es: '¿Has usado terapia de testosterona antes?' },
    type: 'single-select',
    fields: [{
      id: 'prior_testosterone', type: 'radio',
      label: { en: 'Prior Testosterone Use', es: 'Uso Previo de Testosterona' },
      storageKey: 'prior_testosterone',
      options: [
        { id: 'currently_on', label: { en: 'Yes, I am currently on testosterone therapy', es: 'Sí, actualmente estoy en terapia de testosterona' }, value: 'currently_on' },
        { id: 'previously_used', label: { en: 'Yes, I have used it before but not currently', es: 'Sí, lo he usado antes pero no actualmente' }, value: 'previously_used' },
        { id: 'never_used', label: { en: 'No, I have never used testosterone therapy', es: 'No, nunca he usado terapia de testosterona' }, value: 'never_used' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'prior_testosterone', operator: 'in', value: ['currently_on', 'previously_used'] }], target: 'trt-type' },
      { conditions: [{ field: 'prior_testosterone', operator: 'equals', value: 'never_used' }], target: 'blood-work' },
    ],
    prevStep: 'trt-goals',
    progressPercent: 42,
  },

  // ===== TRT TYPE (conditional) =====
  {
    id: 'trt-type',
    path: 'trt-type',
    title: { en: 'What type of testosterone have you used?', es: '¿Qué tipo de testosterona has usado?' },
    type: 'single-select',
    fields: [{
      id: 'trt_type', type: 'radio',
      label: { en: 'Testosterone Type', es: 'Tipo de Testosterona' },
      storageKey: 'trt_type',
      options: [
        { id: 'injections', label: { en: 'Injections (Cypionate/Enanthate)', es: 'Inyecciones (Cipionato/Enantato)' }, value: 'injections' },
        { id: 'topical', label: { en: 'Topical gel or cream', es: 'Gel o crema tópica' }, value: 'topical' },
        { id: 'pellets', label: { en: 'Pellets', es: 'Pellets' }, value: 'pellets' },
        { id: 'patches', label: { en: 'Patches', es: 'Parches' }, value: 'patches' },
        { id: 'other', label: { en: 'Other', es: 'Otro' }, value: 'other' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'trt-dose',
    prevStep: 'prior-testosterone',
    progressPercent: 45,
  },

  // ===== TRT DOSE =====
  {
    id: 'trt-dose',
    path: 'trt-dose',
    title: { en: 'What is your current or most recent dose and frequency?', es: '¿Cuál es tu dosis y frecuencia actual o más reciente?' },
    type: 'input',
    fields: [{
      id: 'trt_dose', type: 'textarea',
      label: { en: 'Dose and Frequency', es: 'Dosis y Frecuencia' },
      placeholder: { en: 'Example: Testosterone Cypionate, 200mg/mL, 0.5mL twice per week', es: 'Ejemplo: Cipionato de Testosterona, 200mg/mL, 0.5mL dos veces por semana' },
      storageKey: 'trt_dose',
      validation: [{ type: 'required', message: { en: 'Please enter your dose and frequency', es: 'Por favor ingresa tu dosis y frecuencia' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'blood-work',
    prevStep: 'trt-type',
    progressPercent: 47,
  },

  // ===== BLOOD WORK =====
  {
    id: 'blood-work',
    path: 'blood-work',
    title: { en: 'Have you had your testosterone levels checked?', es: '¿Te has hecho un análisis de tus niveles de testosterona?' },
    type: 'single-select',
    fields: [{
      id: 'testosterone_blood_work', type: 'radio',
      label: { en: 'Testosterone Blood Work', es: 'Análisis de Testosterona' },
      storageKey: 'testosterone_blood_work',
      options: [
        { id: 'within_60_days', label: { en: 'Yes, within the last 60 days', es: 'Sí, dentro de los últimos 60 días' }, value: 'within_60_days' },
        { id: '3_to_6_months', label: { en: 'Yes, 3 to 6 months ago', es: 'Sí, hace 3 a 6 meses' }, value: '3_to_6_months' },
        { id: 'over_6_months', label: { en: 'Yes, but over 6 months ago', es: 'Sí, pero hace más de 6 meses' }, value: 'over_6_months' },
        { id: 'never', label: { en: 'No, I have never had my levels checked', es: 'No, nunca me he hecho un análisis de niveles' }, value: 'never' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'testosterone_blood_work', operator: 'equals', value: 'within_60_days' }], target: 'lab-upload' },
      { conditions: [{ field: 'testosterone_blood_work', operator: 'in', value: ['3_to_6_months', 'over_6_months'] }], target: 'blood-work-results' },
      { conditions: [{ field: 'testosterone_blood_work', operator: 'equals', value: 'never' }], target: 'activity-level' },
    ],
    prevStep: 'prior-testosterone',
    progressPercent: 50,
  },

  // ===== LAB UPLOAD (within 60 days) =====
  {
    id: 'lab-upload',
    path: 'lab-upload',
    title: { en: 'Upload your lab results', es: 'Sube tus resultados de laboratorio' },
    subtitle: { en: "If you have your lab results available, upload them here. If not, don't worry — you can submit them later.", es: 'Si tienes tus resultados de laboratorio disponibles, súbelos aquí. Si no, no te preocupes — puedes enviarlos después.' },
    type: 'custom',
    component: 'LabUploadStep',
    fields: [{
      id: 'lab_file', type: 'file',
      label: { en: 'Lab Results', es: 'Resultados de Laboratorio' },
      storageKey: 'lab_file',
    }],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'blood-work-results',
    prevStep: 'blood-work',
    progressPercent: 51,
  },

  // ===== BLOOD WORK RESULTS =====
  {
    id: 'blood-work-results',
    path: 'blood-work-results',
    title: { en: 'What were your testosterone levels?', es: '¿Cuáles fueron tus niveles de testosterona?' },
    type: 'input',
    fields: [{
      id: 'testosterone_levels', type: 'textarea',
      label: { en: 'Testosterone Levels', es: 'Niveles de Testosterona' },
      placeholder: { en: 'Example: Total T: 280 ng/dL, Free T: 5.2 pg/mL', es: 'Ejemplo: T Total: 280 ng/dL, T Libre: 5.2 pg/mL' },
      storageKey: 'testosterone_levels',
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'activity-level',
    prevStep: 'blood-work',
    progressPercent: 53,
  },

  // ===== PHYSICAL ACTIVITY LEVEL =====
  {
    id: 'activity-level',
    path: 'activity-level',
    title: { en: 'How would you describe your current level of physical activity?', es: '¿Cómo describirías tu nivel actual de actividad física?' },
    type: 'single-select',
    fields: [{
      id: 'activity_level', type: 'radio',
      label: { en: 'Activity Level', es: 'Nivel de Actividad' },
      storageKey: 'activity_level',
      options: [
        { id: 'sedentary', label: { en: 'Sedentary', es: 'Sedentario' }, value: 'sedentary', description: { en: '(little to no regular physical activity)', es: '(poca o ninguna actividad física regular)' } },
        { id: 'lightly_active', label: { en: 'Lightly active', es: 'Ligeramente activo' }, value: 'lightly_active', description: { en: '(light exercise 1-3 days per week)', es: '(ejercicio ligero 1-3 días por semana)' } },
        { id: 'moderately_active', label: { en: 'Moderately active', es: 'Moderadamente activo' }, value: 'moderately_active', description: { en: '(exercise 3-5 days per week)', es: '(ejercicio 3-5 días por semana)' } },
        { id: 'very_active', label: { en: 'Very active', es: 'Muy activo' }, value: 'very_active', description: { en: '(intense exercise 6-7 days per week)', es: '(ejercicio intenso 6-7 días por semana)' } },
        { id: 'athlete', label: { en: 'Athlete or competitive training', es: 'Atleta o entrenamiento competitivo' }, value: 'athlete' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'prostate-health',
    prevStep: 'blood-work',
    progressPercent: 55,
  },

  // ===== PROSTATE HEALTH =====
  {
    id: 'prostate-health',
    path: 'prostate-health',
    title: { en: 'Do you have any prostate health concerns?', es: '¿Tienes alguna preocupación sobre la salud de tu próstata?' },
    type: 'single-select',
    fields: [{
      id: 'prostate_health', type: 'radio',
      label: { en: 'Prostate Health', es: 'Salud de la Próstata' },
      storageKey: 'prostate_health',
      options: [
        { id: 'none', label: { en: 'None', es: 'Ninguna' }, value: 'none' },
        { id: 'enlarged_prostate', label: { en: 'Enlarged prostate (BPH)', es: 'Próstata agrandada (HPB)' }, value: 'enlarged_prostate' },
        { id: 'elevated_psa', label: { en: 'Elevated PSA levels', es: 'Niveles elevados de PSA' }, value: 'elevated_psa' },
        { id: 'prostate_cancer', label: { en: 'History of prostate cancer', es: 'Historial de cáncer de próstata' }, value: 'prostate_cancer' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'blood-clots',
    prevStep: 'activity-level',
    progressPercent: 58,
  },

  // ===== BLOOD CLOTS =====
  {
    id: 'blood-clots',
    path: 'blood-clots',
    title: { en: 'Do you have a history of blood clots, DVT, or pulmonary embolism?', es: '¿Tienes antecedentes de coágulos sanguíneos, TVP o embolia pulmonar?' },
    type: 'single-select',
    fields: [{
      id: 'blood_clots', type: 'radio',
      label: { en: 'Blood Clots History', es: 'Historial de Coágulos' },
      storageKey: 'blood_clots',
      options: [
        { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'sleep-apnea',
    prevStep: 'prostate-health',
    progressPercent: 61,
  },

  // ===== SLEEP APNEA =====
  {
    id: 'sleep-apnea',
    path: 'sleep-apnea',
    title: { en: 'Have you been diagnosed with sleep apnea?', es: '¿Te han diagnosticado apnea del sueño?' },
    type: 'single-select',
    fields: [{
      id: 'sleep_apnea', type: 'radio',
      label: { en: 'Sleep Apnea', es: 'Apnea del Sueño' },
      storageKey: 'sleep_apnea',
      options: [
        { id: 'yes_treated', label: { en: 'Yes, and I use a CPAP/treatment', es: 'Sí, y uso CPAP/tratamiento' }, value: 'yes_treated' },
        { id: 'yes_untreated', label: { en: 'Yes, but untreated', es: 'Sí, pero sin tratamiento' }, value: 'yes_untreated' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'heart-conditions',
    prevStep: 'blood-clots',
    progressPercent: 63,
  },

  // ===== HEART / CARDIOVASCULAR CONDITIONS =====
  {
    id: 'heart-conditions',
    path: 'heart-conditions',
    title: { en: 'Do you have any cardiovascular history?', es: '¿Tienes algún historial cardiovascular?' },
    type: 'multi-select',
    fields: [{
      id: 'heart_conditions', type: 'checkbox',
      label: { en: 'Cardiovascular History', es: 'Historial Cardiovascular' },
      storageKey: 'heart_conditions',
      options: [
        { id: 'none', label: { en: 'None of these apply to me', es: 'Ninguno de estos aplica' }, value: 'none' },
        { id: 'heart_attack', label: { en: 'Heart attack', es: 'Ataque cardíaco' }, value: 'heart_attack' },
        { id: 'stroke', label: { en: 'Stroke', es: 'Derrame cerebral' }, value: 'stroke' },
        { id: 'heart_disease', label: { en: 'Heart disease', es: 'Enfermedad cardíaca' }, value: 'heart_disease' },
        { id: 'high_cholesterol', label: { en: 'High cholesterol', es: 'Colesterol alto' }, value: 'high_cholesterol' },
      ],
      validation: [{ type: 'required', message: { en: 'Please select at least one option', es: 'Por favor selecciona al menos una opción' } }],
    }],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'fertility-concerns',
    prevStep: 'sleep-apnea',
    progressPercent: 66,
  },

  // ===== FERTILITY CONCERNS =====
  {
    id: 'fertility-concerns',
    path: 'fertility-concerns',
    title: { en: 'Are you currently trying to conceive or planning to in the next 12 months?', es: '¿Estás tratando de concebir o planeas hacerlo en los próximos 12 meses?' },
    subtitle: { en: 'Testosterone therapy can affect sperm production. This is important for your provider to know.', es: 'La terapia de testosterona puede afectar la producción de esperma. Es importante que tu proveedor lo sepa.' },
    type: 'single-select',
    fields: [{
      id: 'fertility_concerns', type: 'radio',
      label: { en: 'Fertility Concerns', es: 'Preocupaciones de Fertilidad' },
      storageKey: 'fertility_concerns',
      options: [
        { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'prescription-medications',
    prevStep: 'heart-conditions',
    progressPercent: 68,
  },

  // ===== PRESCRIPTION MEDICATIONS =====
  {
    id: 'prescription-medications',
    path: 'prescription-medications',
    title: { en: 'Are you taking any prescription medications?', es: '¿Estás tomando algún medicamento recetado?' },
    type: 'single-select',
    fields: [{
      id: 'has_prescription_meds', type: 'radio',
      label: { en: 'Prescription Medications', es: 'Medicamentos Recetados' },
      storageKey: 'has_prescription_meds',
      options: [
        { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'has_prescription_meds', operator: 'equals', value: 'yes' }], target: 'prescription-details' },
      { conditions: [{ field: 'has_prescription_meds', operator: 'equals', value: 'no' }], target: 'medical-conditions' },
    ],
    prevStep: 'fertility-concerns',
    progressPercent: 71,
  },

  // ===== PRESCRIPTION DETAILS (conditional) =====
  {
    id: 'prescription-details',
    path: 'prescription-details',
    title: { en: 'What prescription medications are you currently taking?', es: '¿Qué medicamentos recetados estás tomando actualmente?' },
    subtitle: { en: 'Search and add each medication.', es: 'Busca y agrega cada medicamento.' },
    type: 'custom',
    component: 'PrescriptionSearchStep',
    fields: [{
      id: 'prescription_details', type: 'text',
      label: { en: 'Prescription Details', es: 'Detalles de Receta' },
      storageKey: 'prescription_details',
      validation: [{ type: 'required', message: { en: 'Please add at least one medication', es: 'Por favor agrega al menos un medicamento' } }],
    }],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'medical-conditions',
    prevStep: 'prescription-medications',
    progressPercent: 74,
  },

  // ===== MEDICAL CONDITIONS =====
  {
    id: 'medical-conditions',
    path: 'medical-conditions',
    title: { en: 'Do you have any medical condition or chronic illness?', es: '¿Tienes alguna condición médica o enfermedad crónica?' },
    subtitle: { en: 'This helps your provider get a complete view of your medical history. Include any condition that affects your blood pressure, heart, kidneys (including kidney stones), or liver, as well as conditions such as diabetes, high cholesterol, stroke, cancer, or gout.', es: 'Esto ayuda a tu proveedor a obtener una vista completa de tu historial médico. Incluye cualquier condición que afecte tu presión arterial, corazón, riñones (incluyendo cálculos renales) o hígado, así como condiciones como diabetes, colesterol alto, derrame cerebral, cáncer o gota.' },
    type: 'single-select',
    fields: [{
      id: 'has_medical_conditions', type: 'radio',
      label: { en: 'Medical Conditions', es: 'Condiciones Médicas' },
      storageKey: 'has_medical_conditions',
      options: [
        { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'allergies',
    prevStep: 'prescription-medications',
    progressPercent: 76,
  },

  // ===== ALLERGIES =====
  {
    id: 'allergies',
    path: 'allergies',
    title: { en: 'Do you have any allergies?', es: '¿Tienes alguna alergia?' },
    type: 'single-select',
    fields: [{
      id: 'has_allergies', type: 'radio',
      label: { en: 'Allergies', es: 'Alergias' },
      storageKey: 'has_allergies',
      options: [
        { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
        { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'has_allergies', operator: 'equals', value: 'yes' }], target: 'allergy-details' },
      { conditions: [{ field: 'has_allergies', operator: 'equals', value: 'no' }], target: 'lab-work' },
    ],
    prevStep: 'medical-conditions',
    progressPercent: 79,
  },

  // ===== ALLERGY DETAILS (conditional) =====
  {
    id: 'allergy-details',
    path: 'allergy-details',
    title: { en: 'What are you allergic to?', es: '¿A qué eres alérgico?' },
    type: 'custom',
    component: 'AllergySearchStep',
    fields: [{
      id: 'allergy_details', type: 'text',
      label: { en: 'Allergy Details', es: 'Detalles de Alergia' },
      storageKey: 'allergy_details',
      validation: [{ type: 'required', message: { en: 'Please add at least one allergy', es: 'Por favor agrega al menos una alergia' } }],
    }],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'lab-work',
    prevStep: 'allergies',
    progressPercent: 82,
  },

  // ===== RECENT LAB WORK =====
  {
    id: 'lab-work',
    path: 'lab-work',
    title: { en: 'When was your most recent in-person medical evaluation with lab work?', es: '¿Cuándo fue tu evaluación médica presencial más reciente con análisis de laboratorio?' },
    type: 'single-select',
    fields: [{
      id: 'recent_lab_work', type: 'radio',
      label: { en: 'Recent Lab Work', es: 'Análisis Recientes' },
      storageKey: 'recent_lab_work',
      options: [
        { id: '3_months', label: { en: 'Within the last 3 months', es: 'Dentro de los últimos 3 meses' }, value: '3_months' },
        { id: '6_months', label: { en: 'Within the last 6 months', es: 'Dentro de los últimos 6 meses' }, value: '6_months' },
        { id: 'over_6_months', label: { en: 'Over 6 months ago', es: 'Hace más de 6 meses' }, value: 'over_6_months' },
        { id: 'over_1_year', label: { en: 'Over 1 year ago', es: 'Hace más de 1 año' }, value: 'over_1_year' },
        { id: 'never', label: { en: 'I do not remember or I have never had labs done', es: 'No recuerdo o nunca me han hecho análisis' }, value: 'never' },
      ],
    }],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'referral-source',
    prevStep: 'allergies',
    progressPercent: 84,
  },

  // ===== REFERRAL SOURCE =====
  {
    id: 'referral-source', path: 'referral-source',
    title: { en: 'How did you hear about Overtime?', es: '¿Cómo escuchaste sobre Overtime?' },
    type: 'custom', component: 'ReferralSourceStep', fields: [{
      id: 'referral_source', type: 'radio',
      label: { en: 'Referral Source', es: 'Fuente de Referencia' },
      storageKey: 'referral_source',
      options: [
        { id: 'instagram', label: { en: 'Instagram', es: 'Instagram' }, value: 'instagram' },
        { id: 'facebook', label: { en: 'Facebook', es: 'Facebook' }, value: 'facebook' },
        { id: 'friend_family', label: { en: 'Friend/Family', es: 'Amigo/Familia' }, value: 'friend_family' },
        { id: 'google', label: { en: 'Google', es: 'Google' }, value: 'google' },
        { id: 'youtube', label: { en: 'Youtube', es: 'Youtube' }, value: 'youtube' },
        { id: 'tiktok', label: { en: 'Tiktok', es: 'Tiktok' }, value: 'tiktok' },
        { id: 'ot_rep', label: { en: 'Overtime Representative', es: 'Representante de Overtime' }, value: 'ot_rep' },
      ],
    }],
    autoAdvance: false, showContinueButton: false,
    nextStep: [
      { conditions: [{ field: 'referral_source', operator: 'in', value: ['friend_family', 'ot_rep'] }], target: 'referral-name' },
      { conditions: [{ field: 'referral_source', operator: 'notIn', value: ['friend_family', 'ot_rep'] }], target: 'review' },
    ],
    prevStep: 'lab-work', progressPercent: 87,
  },
  {
    id: 'referral-name', path: 'referral-name',
    title: { en: "What's the name of the person who referred you?", es: '¿Cuál es el nombre de la persona que te refirió?' },
    type: 'custom', component: 'ReferralNameStep',
    fields: [{
      id: 'referrer_name', type: 'text',
      label: { en: 'Referrer Name', es: 'Nombre del Referente' },
      placeholder: { en: 'Enter their name', es: 'Ingresa su nombre' },
      storageKey: 'referrer_name',
    }],
    autoAdvance: false, showContinueButton: true,
    nextStep: 'review', prevStep: 'referral-source', progressPercent: 89,
  },

  // ===== REVIEW & SUBMISSION =====
  {
    id: 'review', path: 'review',
    title: { en: 'Review your information', es: 'Revisa tu información' },
    subtitle: { en: 'Please verify the information below before submitting.', es: 'Por favor verifica la información antes de enviar.' },
    type: 'custom', component: 'ReviewStep', fields: [],
    autoAdvance: false, showContinueButton: true,
    nextStep: 'finding-provider', prevStep: 'lab-work', progressPercent: 92,
  },
  {
    id: 'finding-provider', path: 'finding-provider',
    title: { en: 'Finding your provider...', es: 'Buscando tu proveedor...' },
    type: 'custom', component: 'FindingProviderStep', fields: [],
    autoAdvance: true, showContinueButton: false,
    nextStep: 'qualified', prevStep: 'review', progressPercent: 95,
  },
  {
    id: 'qualified', path: 'qualified',
    title: { en: 'Great news!', es: '¡Excelentes noticias!' },
    subtitle: { en: 'Based on your responses, you may qualify for Testosterone Replacement Therapy. A licensed provider will review your information.', es: 'Según tus respuestas, puedes calificar para la Terapia de Reemplazo de Testosterona. Un proveedor licenciado revisará tu información.' },
    type: 'custom', component: 'QualifiedStep', fields: [],
    autoAdvance: false, showContinueButton: false,
    nextStep: 'book-appointment', prevStep: 'review', progressPercent: 97,
  },
  {
    id: 'book-appointment', path: 'book-appointment',
    title: { en: 'Book Your Appointment', es: 'Reserva Tu Cita' },
    subtitle: { en: 'Schedule a consultation with one of our licensed providers.', es: 'Programa una consulta con uno de nuestros proveedores licenciados.' },
    type: 'custom', component: 'BookAppointmentStep', fields: [],
    autoAdvance: false, showContinueButton: false,
    nextStep: null, prevStep: 'qualified', progressPercent: 100,
  },
];

export const otMensTRTIntakeConfig: FormConfig = {
  id: 'ot-mens-trt-intake',
  name: 'OT Mens Health TRT Intake',
  version: '1.0.0',
  description: 'Comprehensive medical intake for Overtime Men\'s Health Testosterone Replacement Therapy programs',
  treatmentType: 'trt',
  steps,
  startStep: 'trt-intro',
  languages: ['en'],
  defaultLanguage: 'en',
  integrations: [
    { type: 'platform', triggers: ['complete'] },
  ],
  branding: {
    logo: 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg',
    primaryColor: '#413d3d',
    accentColor: '#cab172',
    secondaryColor: '#f5ecd8',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

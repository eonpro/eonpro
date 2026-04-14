/**
 * OT Mens Health Peptide Intake Form — Sermorelin Therapy
 *
 * Peptide therapy intake for ot.eonpro.io (Overtime Men's Health).
 * Evaluates symptoms, goals, activity level, and medical history
 * specific to Sermorelin/peptide therapy eligibility.
 * Ends with booking, same as the OT weight-loss flow.
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
    id: 'peptide-intro',
    path: 'peptide-intro',
    title: {
      en: 'Support healthy aging and recovery.',
      es: 'Apoya el envejecimiento saludable y la recuperación.',
    },
    subtitle: {
      en: "Optimize your body's natural regulation.",
      es: 'Optimiza la regulación natural de tu cuerpo.',
    },
    type: 'custom',
    component: 'PeptideLandingStep',
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
    title: {
      en: 'Which of the following symptoms do you currently experience?',
      es: '¿Cuáles de los siguientes síntomas experimentas actualmente?',
    },
    type: 'multi-select',
    fields: [
      {
        id: 'peptide_symptoms',
        type: 'checkbox',
        label: { en: 'Symptoms', es: 'Síntomas' },
        storageKey: 'peptide_symptoms',
        options: [
          { id: 'brain_fog', label: { en: 'Brain fog', es: 'Niebla mental' }, value: 'brain_fog' },
          {
            id: 'chronic_fatigue',
            label: { en: 'Chronic fatigue or low energy', es: 'Fatiga crónica o baja energía' },
            value: 'chronic_fatigue',
          },
          {
            id: 'poor_focus',
            label: {
              en: 'Difficulty focusing or poor concentration',
              es: 'Dificultad para concentrarse',
            },
            value: 'poor_focus',
          },
          {
            id: 'low_endurance',
            label: {
              en: 'Low endurance or exercise tolerance',
              es: 'Baja resistencia o tolerancia al ejercicio',
            },
            value: 'low_endurance',
          },
          {
            id: 'decreased_libido',
            label: { en: 'Decreased libido', es: 'Disminución del libido' },
            value: 'decreased_libido',
          },
          {
            id: 'muscle_loss',
            label: { en: 'Loss of muscle mass', es: 'Pérdida de masa muscular' },
            value: 'muscle_loss',
          },
          {
            id: 'muscle_weakness',
            label: { en: 'Muscle weakness', es: 'Debilidad muscular' },
            value: 'muscle_weakness',
          },
          {
            id: 'sleep_disturbance',
            label: {
              en: 'Sleep disturbances or poor sleep quality',
              es: 'Trastornos del sueño o mala calidad del sueño',
            },
            value: 'sleep_disturbance',
          },
          {
            id: 'weight_gain',
            label: {
              en: 'Weight gain or difficulty losing weight',
              es: 'Aumento de peso o dificultad para perder peso',
            },
            value: 'weight_gain',
          },
        ],
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please select at least one symptom',
              es: 'Por favor selecciona al menos un síntoma',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'consent',
    prevStep: 'peptide-intro',
    progressPercent: 4,
  },

  // ===== CONSENT =====
  {
    id: 'consent',
    path: 'consent',
    title: {
      en: 'Safe, clinically guided Peptide support',
      es: 'Apoyo peptídico seguro y clínicamente guiado',
    },
    subtitle: {
      en: 'Receive personalized clinical insights and lab recommendations tailored to your physiology, recovery patterns, and long-term wellness goals.',
      es: 'Recibe información clínica personalizada y recomendaciones de laboratorio adaptadas a tu fisiología, patrones de recuperación y objetivos de bienestar a largo plazo.',
    },
    type: 'custom',
    component: 'ConsentStep',
    fields: [
      {
        id: 'consent_accepted',
        type: 'checkbox',
        label: { en: 'I understand and agree', es: 'Entiendo y acepto' },
        storageKey: 'consent_accepted',
        validation: [
          {
            type: 'required',
            message: { en: 'You must accept to continue', es: 'Debes aceptar para continuar' },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'state',
    prevStep: 'symptoms',
    progressPercent: 8,
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
    subtitle: {
      en: 'This is the state where your medication will be shipped, if prescribed.',
      es: 'Este es el estado donde se enviará tu medicamento, si se receta.',
    },
    type: 'custom',
    component: 'StateSelectStep',
    fields: [
      {
        id: 'state',
        type: 'select',
        label: { en: 'State', es: 'Estado' },
        storageKey: 'state',
        options: stateOptions,
        validation: [
          {
            type: 'required',
            message: { en: 'Please select a state', es: 'Por favor selecciona un estado' },
          },
        ],
      },
      {
        id: 'terms_accepted',
        type: 'checkbox',
        label: {
          en: 'I agree to the Terms and Conditions and Privacy Policy',
          es: 'Acepto los Términos y Condiciones y la Política de Privacidad',
        },
        storageKey: 'terms_accepted',
        validation: [
          {
            type: 'required',
            message: { en: 'You must accept the terms', es: 'Debes aceptar los términos' },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'name',
    prevStep: 'consent',
    progressPercent: 12,
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
    subtitle: {
      en: 'This way, we can personalize your experience from the very beginning.',
      es: 'De esta manera, podemos personalizar tu experiencia desde el inicio.',
    },
    type: 'input',
    fields: [
      {
        id: 'firstName',
        type: 'text',
        label: { en: 'First Name', es: 'Nombre' },
        placeholder: { en: 'First Name', es: 'Nombre' },
        storageKey: 'firstName',
        validation: [
          {
            type: 'required',
            message: { en: 'First name is required', es: 'El nombre es requerido' },
          },
        ],
      },
      {
        id: 'lastName',
        type: 'text',
        label: { en: 'Last Name', es: 'Apellido' },
        placeholder: { en: 'Last Name', es: 'Apellido' },
        storageKey: 'lastName',
        validation: [
          {
            type: 'required',
            message: { en: 'Last name is required', es: 'El apellido es requerido' },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'dob',
    prevStep: 'state',
    progressPercent: 16,
  },

  // ===== DATE OF BIRTH =====
  {
    id: 'dob',
    path: 'dob',
    title: {
      en: 'To check if you qualify, tell us your date of birth.',
      es: 'Para verificar si calificas, dinos tu fecha de nacimiento.',
    },
    subtitle: {
      en: 'This helps us confirm that you meet the age requirements for treatment.',
      es: 'Esto nos ayuda a confirmar que cumples con los requisitos de edad para el tratamiento.',
    },
    type: 'custom',
    component: 'DateOfBirthStep',
    fields: [
      {
        id: 'dob',
        type: 'date',
        label: { en: 'Date of Birth', es: 'Fecha de Nacimiento' },
        placeholder: {
          en: 'Date of Birth (Month/Day/Year)',
          es: 'Fecha de Nacimiento (Mes/Día/Año)',
        },
        storageKey: 'dob',
        validation: [
          {
            type: 'required',
            message: { en: 'Date of birth is required', es: 'La fecha de nacimiento es requerida' },
          },
          {
            type: 'age',
            value: 18,
            message: {
              en: 'You must be at least 18 years old',
              es: 'Debes tener al menos 18 años',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'support-info',
    prevStep: 'name',
    progressPercent: 20,
  },

  // ===== SUPPORT INFO =====
  {
    id: 'support-info',
    path: 'support-info',
    title: {
      en: 'Did you know that Overtime assigns a representative to your case to guide and support you every step of the way.',
      es: 'Sabías que Overtime asigna un representante a tu caso para guiarte y apoyarte en cada paso.',
    },
    subtitle: {
      en: "We know things can sometimes be confusing, which is why we're here to guide and support you.",
      es: 'Sabemos que las cosas a veces pueden ser confusas, por eso estamos aquí para guiarte y apoyarte.',
    },
    type: 'custom',
    component: 'SupportInfoStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'address',
    prevStep: 'dob',
    progressPercent: 24,
  },

  // ===== ADDRESS =====
  {
    id: 'address',
    path: 'address',
    title: { en: 'What is your home address?', es: '¿Cuál es tu dirección?' },
    subtitle: {
      en: 'We use your address to confirm that our services are available in your state and to meet local medical requirements.',
      es: 'Usamos tu dirección para confirmar que nuestros servicios están disponibles en tu estado y para cumplir con los requisitos médicos locales.',
    },
    type: 'custom',
    component: 'AddressStep',
    fields: [
      {
        id: 'street',
        type: 'text',
        label: { en: 'Address', es: 'Dirección' },
        placeholder: { en: 'Address', es: 'Dirección' },
        storageKey: 'street',
        validation: [
          {
            type: 'required',
            message: { en: 'Address is required', es: 'La dirección es requerida' },
          },
        ],
      },
      {
        id: 'apartment',
        type: 'text',
        label: { en: 'Apartment Number*', es: 'Número de Apartamento*' },
        placeholder: { en: 'Apartment Number*', es: 'Número de Apartamento*' },
        storageKey: 'apartment',
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'current-weight',
    prevStep: 'support-info',
    progressPercent: 28,
    props: {
      apartmentNote: {
        en: '*Only if applicable. Leave blank if you live in a house.',
        es: '*Solo si aplica. Dejar en blanco si vives en una casa.',
      },
    },
  },

  // ===== WEIGHT & HEIGHT =====
  {
    id: 'current-weight',
    path: 'current-weight',
    title: { en: 'What is your current weight?', es: '¿Cuál es tu peso actual?' },
    subtitle: {
      en: '*Numbers only. Example: if your current weight is 140 lbs, enter 140 in the box.',
      es: '*Solo números. Ejemplo: si tu peso actual es 140 lbs, ingresa 140 en la casilla.',
    },
    type: 'custom',
    component: 'WeightHeightStep',
    fields: [
      {
        id: 'current_weight',
        type: 'number',
        label: { en: 'Current Weight (lbs)', es: 'Peso Actual (lbs)' },
        storageKey: 'current_weight',
        validation: [
          {
            type: 'required',
            message: { en: 'Please enter your weight', es: 'Por favor ingresa tu peso' },
          },
        ],
      },
      {
        id: 'height_feet',
        type: 'select',
        label: { en: 'Height (feet)', es: 'Altura (pies)' },
        storageKey: 'height_feet',
        options: heightFeetOptions,
        validation: [
          {
            type: 'required',
            message: { en: 'Please select feet', es: 'Por favor selecciona pies' },
          },
        ],
      },
      {
        id: 'height_inches',
        type: 'select',
        label: { en: 'Height (inches)', es: 'Altura (pulgadas)' },
        storageKey: 'height_inches',
        options: heightInchesOptions,
        validation: [
          {
            type: 'required',
            message: { en: 'Please select inches', es: 'Por favor selecciona pulgadas' },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'bmi-calculating',
    prevStep: 'address',
    progressPercent: 32,
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
    progressPercent: 34,
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
    progressPercent: 36,
  },

  // ===== CONTACT INFO =====
  {
    id: 'contact-info',
    path: 'contact-info',
    title: { en: 'How can we contact you?', es: '¿Cómo podemos contactarte?' },
    subtitle: {
      en: 'We use this information to keep you informed about your treatment, send you important updates, and help you stay connected with your provider.',
      es: 'Usamos esta información para mantenerte informado sobre tu tratamiento, enviarte actualizaciones importantes y ayudarte a mantenerte conectado con tu proveedor.',
    },
    type: 'custom',
    component: 'ContactInfoStep',
    fields: [
      {
        id: 'email',
        type: 'email',
        label: { en: 'Email', es: 'Correo electrónico' },
        placeholder: { en: 'Email', es: 'Correo electrónico' },
        storageKey: 'email',
        validation: [
          {
            type: 'required',
            message: { en: 'Email is required', es: 'El correo electrónico es requerido' },
          },
          {
            type: 'email',
            message: { en: 'Please enter a valid email', es: 'Por favor ingresa un correo válido' },
          },
        ],
      },
      {
        id: 'phone',
        type: 'phone',
        label: { en: 'Phone number', es: 'Número de teléfono' },
        placeholder: { en: 'Phone number', es: 'Número de teléfono' },
        storageKey: 'phone',
        validation: [
          {
            type: 'required',
            message: { en: 'Phone number is required', es: 'El número de teléfono es requerido' },
          },
          {
            type: 'phone',
            message: {
              en: 'Please enter a valid phone number',
              es: 'Por favor ingresa un número válido',
            },
          },
        ],
      },
      {
        id: 'contact_consent',
        type: 'checkbox',
        label: {
          en: 'I accept the Privacy Policy and I authorize receiving important communications via email and text messages (SMS) from OT Mens / EONPro and affiliates regarding my treatment.',
          es: 'Acepto la Política de Privacidad y autorizo recibir comunicaciones importantes por correo electrónico y mensajes de texto (SMS) de OT Mens / EONPro y afiliados sobre mi tratamiento.',
        },
        storageKey: 'contact_consent',
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'medical-history-overview',
    prevStep: 'current-weight',
    progressPercent: 38,
  },

  // ===== MEDICAL HISTORY SECTION =====
  {
    id: 'medical-history-overview',
    path: 'medical-history-overview',
    title: { en: 'Now, complete your medical history', es: 'Ahora, completa tu historial médico' },
    subtitle: {
      en: 'This information helps our providers create a safe, personalized plan.',
      es: 'Esta información ayuda a nuestros proveedores a crear un plan seguro y personalizado.',
    },
    type: 'custom',
    component: 'MedicalHistoryOverviewStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'gender',
    prevStep: 'contact-info',
    progressPercent: 42,
  },

  // ===== GENDER =====
  {
    id: 'gender',
    path: 'gender',
    title: { en: 'What is your gender?', es: '¿Cuál es tu género?' },
    subtitle: {
      en: 'This medical information helps us properly assess your eligibility and determine the most appropriate treatment.',
      es: 'Esta información médica nos ayuda a evaluar adecuadamente tu elegibilidad y determinar el tratamiento más apropiado.',
    },
    type: 'single-select',
    fields: [
      {
        id: 'sex',
        type: 'radio',
        label: { en: 'Gender', es: 'Género' },
        storageKey: 'sex',
        options: [
          { id: 'male', label: { en: 'Man', es: 'Hombre' }, value: 'male' },
          { id: 'female', label: { en: 'Woman', es: 'Mujer' }, value: 'female' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'peptide-selection',
    prevStep: 'medical-history-overview',
    progressPercent: 46,
    props: {
      disclaimer: {
        en: 'OT Mens provides medical care without discrimination. We do not discriminate based on sex, gender, gender identity, sexual orientation, age, race, color, religion, national origin, marital status, disability, or any other characteristic protected by law. Your privacy and dignity are a priority at all times.',
        es: 'OT Mens brinda atención médica sin discriminación. No discriminamos por sexo, género, identidad de género, orientación sexual, edad, raza, color, religión, origen nacional, estado civil, discapacidad u otra característica protegida por la ley. Tu privacidad y dignidad son prioridad en todo momento.',
      },
    },
  },

  // ===== PEPTIDE THERAPY SELECTION =====
  {
    id: 'peptide-selection',
    path: 'peptide-selection',
    title: {
      en: 'Which peptide therapy are you interested in starting today?',
      es: '¿Qué terapia de péptidos te interesa comenzar hoy?',
    },
    type: 'single-select',
    fields: [
      {
        id: 'peptide_therapy',
        type: 'radio',
        label: { en: 'Peptide Therapy', es: 'Terapia de Péptidos' },
        storageKey: 'peptide_therapy',
        options: [
          { id: 'sermorelin', label: { en: 'Sermorelin', es: 'Sermorelin' }, value: 'sermorelin' },
          {
            id: 'not_sure',
            label: { en: "I'm not sure yet", es: 'No estoy seguro aún' },
            value: 'not_sure',
          },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'sermorelin-goals',
    prevStep: 'gender',
    progressPercent: 50,
  },

  // ===== SERMORELIN GOALS =====
  {
    id: 'sermorelin-goals',
    path: 'sermorelin-goals',
    title: {
      en: 'What are your goals with Sermorelin therapy?',
      es: '¿Cuáles son tus objetivos con la terapia de Sermorelin?',
    },
    type: 'multi-select',
    fields: [
      {
        id: 'sermorelin_goals',
        type: 'checkbox',
        label: { en: 'Sermorelin Goals', es: 'Objetivos de Sermorelin' },
        storageKey: 'sermorelin_goals',
        options: [
          {
            id: 'sleep',
            label: { en: 'Improved sleep quality', es: 'Mejorar la calidad del sueño' },
            value: 'sleep',
          },
          {
            id: 'energy',
            label: { en: 'Increased energy and vitality', es: 'Mayor energía y vitalidad' },
            value: 'energy',
          },
          {
            id: 'muscle',
            label: {
              en: 'Muscle growth or preservation',
              es: 'Crecimiento o preservación muscular',
            },
            value: 'muscle',
          },
          {
            id: 'weight',
            label: {
              en: 'Weight management or fat loss',
              es: 'Control de peso o pérdida de grasa',
            },
            value: 'weight',
          },
          {
            id: 'recovery',
            label: {
              en: 'Improved recovery or injury prevention',
              es: 'Mejor recuperación o prevención de lesiones',
            },
            value: 'recovery',
          },
          {
            id: 'anti_aging',
            label: {
              en: 'Anti-aging or longevity support',
              es: 'Soporte anti-envejecimiento o longevidad',
            },
            value: 'anti_aging',
          },
          {
            id: 'other',
            label: { en: 'Other (please specify)', es: 'Otro (por favor especifica)' },
            value: 'other',
          },
        ],
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please select at least one goal',
              es: 'Por favor selecciona al menos un objetivo',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'optimize',
    prevStep: 'peptide-selection',
    progressPercent: 54,
  },

  // ===== WHAT ARE YOU LOOKING TO OPTIMIZE =====
  {
    id: 'optimize',
    path: 'optimize',
    title: { en: 'What are you looking to optimize?', es: '¿Qué buscas optimizar?' },
    type: 'multi-select',
    fields: [
      {
        id: 'optimize_goals',
        type: 'checkbox',
        label: { en: 'Optimization Goals', es: 'Objetivos de Optimización' },
        storageKey: 'optimize_goals',
        options: [
          {
            id: 'recovery_tissue',
            label: {
              en: 'Support recovery and tissue repair',
              es: 'Apoyar la recuperación y reparación de tejidos',
            },
            value: 'recovery_tissue',
          },
          {
            id: 'energy',
            label: { en: 'Increased energy and vitality', es: 'Mayor energía y vitalidad' },
            value: 'energy',
          },
          {
            id: 'muscle',
            label: {
              en: 'Muscle growth or preservation',
              es: 'Crecimiento o preservación muscular',
            },
            value: 'muscle',
          },
          {
            id: 'weight',
            label: {
              en: 'Weight management or fat loss',
              es: 'Control de peso o pérdida de grasa',
            },
            value: 'weight',
          },
          {
            id: 'recovery',
            label: {
              en: 'Improved recovery or injury prevention',
              es: 'Mejor recuperación o prevención de lesiones',
            },
            value: 'recovery',
          },
          {
            id: 'anti_aging',
            label: {
              en: 'Anti-aging or longevity support',
              es: 'Soporte anti-envejecimiento o longevidad',
            },
            value: 'anti_aging',
          },
          {
            id: 'other',
            label: { en: 'Other (please specify)', es: 'Otro (por favor especifica)' },
            value: 'other',
          },
        ],
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please select at least one option',
              es: 'Por favor selecciona al menos una opción',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'activity-level',
    prevStep: 'sermorelin-goals',
    progressPercent: 58,
  },

  // ===== PHYSICAL ACTIVITY LEVEL =====
  {
    id: 'activity-level',
    path: 'activity-level',
    title: {
      en: 'How would you describe your current level of physical activity?',
      es: '¿Cómo describirías tu nivel actual de actividad física?',
    },
    type: 'single-select',
    fields: [
      {
        id: 'activity_level',
        type: 'radio',
        label: { en: 'Activity Level', es: 'Nivel de Actividad' },
        storageKey: 'activity_level',
        options: [
          {
            id: 'sedentary',
            label: { en: 'Sedentary', es: 'Sedentario' },
            value: 'sedentary',
            description: {
              en: '(little to no regular physical activity)',
              es: '(poca o ninguna actividad física regular)',
            },
          },
          {
            id: 'lightly_active',
            label: { en: 'Lightly active', es: 'Ligeramente activo' },
            value: 'lightly_active',
            description: {
              en: '(light exercise 1-3 days per week)',
              es: '(ejercicio ligero 1-3 días por semana)',
            },
          },
          {
            id: 'moderately_active',
            label: { en: 'Moderately active', es: 'Moderadamente activo' },
            value: 'moderately_active',
            description: {
              en: '(exercise 3-5 days per week)',
              es: '(ejercicio 3-5 días por semana)',
            },
          },
          {
            id: 'very_active',
            label: { en: 'Very active', es: 'Muy activo' },
            value: 'very_active',
            description: {
              en: '(intense exercise 6-7 days per week)',
              es: '(ejercicio intenso 6-7 días por semana)',
            },
          },
          {
            id: 'athlete',
            label: {
              en: 'Athlete or competitive training',
              es: 'Atleta o entrenamiento competitivo',
            },
            value: 'athlete',
          },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'sermorelin-medications',
    prevStep: 'optimize',
    progressPercent: 62,
  },

  // ===== SERMORELIN-SPECIFIC MEDICATIONS =====
  {
    id: 'sermorelin-medications',
    path: 'sermorelin-medications',
    title: {
      en: 'Are you currently taking any of the following medications?',
      es: '¿Estás tomando actualmente alguno de los siguientes medicamentos?',
    },
    subtitle: {
      en: "These may interfere with Sermorelin's effectiveness.",
      es: 'Estos pueden interferir con la efectividad de Sermorelin.',
    },
    type: 'multi-select',
    fields: [
      {
        id: 'sermorelin_medications',
        type: 'checkbox',
        label: { en: 'Medications', es: 'Medicamentos' },
        storageKey: 'sermorelin_medications',
        options: [
          {
            id: 'none',
            label: { en: 'None of these apply to me', es: 'Ninguno de estos aplica' },
            value: 'none',
          },
          {
            id: 'clonidine_levodopa',
            label: { en: 'Clonidine or Levodopa', es: 'Clonidina o Levodopa' },
            value: 'clonidine_levodopa',
          },
          {
            id: 'somatostatin_analogs',
            label: {
              en: 'Octreotide, Lanreotide, or Pasireotide',
              es: 'Octreotida, Lanreotida o Pasireotida',
            },
            value: 'somatostatin_analogs',
          },
          {
            id: 'glucocorticoids',
            label: {
              en: 'Glucocorticoids (for example prednisone or dexamethasone)',
              es: 'Glucocorticoides (por ejemplo prednisona o dexametasona)',
            },
            value: 'glucocorticoids',
          },
          {
            id: 'cox_inhibitors',
            label: {
              en: 'COX inhibitors (for example aspirin, ibuprofen, Advil, Celebrex)',
              es: 'Inhibidores COX (por ejemplo aspirina, ibuprofeno, Advil, Celebrex)',
            },
            value: 'cox_inhibitors',
          },
        ],
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please select at least one option',
              es: 'Por favor selecciona al menos una opción',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'prescription-medications',
    prevStep: 'activity-level',
    progressPercent: 66,
  },

  // ===== PRESCRIPTION MEDICATIONS =====
  {
    id: 'prescription-medications',
    path: 'prescription-medications',
    title: {
      en: 'Are you taking any prescription medications?',
      es: '¿Estás tomando algún medicamento recetado?',
    },
    type: 'single-select',
    fields: [
      {
        id: 'has_prescription_meds',
        type: 'radio',
        label: { en: 'Prescription Medications', es: 'Medicamentos Recetados' },
        storageKey: 'has_prescription_meds',
        options: [
          { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
          { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      {
        conditions: [{ field: 'has_prescription_meds', operator: 'equals', value: 'yes' }],
        target: 'prescription-details',
      },
      {
        conditions: [{ field: 'has_prescription_meds', operator: 'equals', value: 'no' }],
        target: 'vitamin-b12',
      },
    ],
    prevStep: 'sermorelin-medications',
    progressPercent: 70,
  },

  // ===== PRESCRIPTION DETAILS (conditional) =====
  {
    id: 'prescription-details',
    path: 'prescription-details',
    title: {
      en: 'What prescription medications are you currently taking?',
      es: '¿Qué medicamentos recetados estás tomando actualmente?',
    },
    subtitle: { en: 'Search and add each medication.', es: 'Busca y agrega cada medicamento.' },
    type: 'custom',
    component: 'PrescriptionSearchStep',
    fields: [
      {
        id: 'prescription_details',
        type: 'text',
        label: { en: 'Prescription Details', es: 'Detalles de Receta' },
        storageKey: 'prescription_details',
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please add at least one medication',
              es: 'Por favor agrega al menos un medicamento',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'vitamin-b12',
    prevStep: 'prescription-medications',
    progressPercent: 72,
  },

  // ===== VITAMIN B-12 =====
  {
    id: 'vitamin-b12',
    path: 'vitamin-b12',
    title: {
      en: 'Have you ever been diagnosed with a Vitamin B-12 deficiency or absorption disorder?',
      es: '¿Alguna vez te han diagnosticado una deficiencia de Vitamina B-12 o un trastorno de absorción?',
    },
    subtitle: {
      en: "Certain digestive conditions, such as Crohn's disease or celiac disease, may affect B-12 levels.",
      es: 'Ciertas condiciones digestivas, como la enfermedad de Crohn o la enfermedad celíaca, pueden afectar los niveles de B-12.',
    },
    type: 'single-select',
    fields: [
      {
        id: 'vitamin_b12_deficiency',
        type: 'radio',
        label: { en: 'Vitamin B-12', es: 'Vitamina B-12' },
        storageKey: 'vitamin_b12_deficiency',
        options: [
          { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
          { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'medical-conditions',
    prevStep: 'prescription-medications',
    progressPercent: 76,
  },

  // ===== MEDICAL CONDITIONS =====
  {
    id: 'medical-conditions',
    path: 'medical-conditions',
    title: {
      en: 'Do you have any medical condition or chronic illness?',
      es: '¿Tienes alguna condición médica o enfermedad crónica?',
    },
    subtitle: {
      en: 'This helps your provider get a complete view of your medical history. Include any condition that affects your blood pressure, heart, kidneys (including kidney stones), or liver, as well as conditions such as diabetes, high cholesterol, stroke, cancer, or gout.',
      es: 'Esto ayuda a tu proveedor a obtener una vista completa de tu historial médico. Incluye cualquier condición que afecte tu presión arterial, corazón, riñones (incluyendo cálculos renales) o hígado, así como condiciones como diabetes, colesterol alto, derrame cerebral, cáncer o gota.',
    },
    type: 'single-select',
    fields: [
      {
        id: 'has_medical_conditions',
        type: 'radio',
        label: { en: 'Medical Conditions', es: 'Condiciones Médicas' },
        storageKey: 'has_medical_conditions',
        options: [
          { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
          { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'sermorelin-conditions',
    prevStep: 'vitamin-b12',
    progressPercent: 80,
  },

  // ===== SERMORELIN-SPECIFIC CONDITIONS =====
  {
    id: 'sermorelin-conditions',
    path: 'sermorelin-conditions',
    title: { en: 'Do any of the following apply to you?', es: '¿Aplica alguno de los siguientes?' },
    subtitle: {
      en: 'These questions are important for medical safety and eligibility.',
      es: 'Estas preguntas son importantes para la seguridad médica y elegibilidad.',
    },
    type: 'multi-select',
    fields: [
      {
        id: 'sermorelin_conditions',
        type: 'checkbox',
        label: { en: 'Sermorelin Conditions', es: 'Condiciones de Sermorelin' },
        storageKey: 'sermorelin_conditions',
        options: [
          {
            id: 'none',
            label: { en: 'None of these apply to me', es: 'Ninguno de estos aplica' },
            value: 'none',
          },
          {
            id: 'hypothyroidism',
            label: { en: 'I have hypothyroidism', es: 'Tengo hipotiroidismo' },
            value: 'hypothyroidism',
            description: {
              en: '(must be well-controlled prior to starting Sermorelin)',
              es: '(debe estar bien controlado antes de iniciar Sermorelin)',
            },
          },
          {
            id: 'glioma',
            label: { en: 'I have a history of glioma', es: 'Tengo antecedentes de glioma' },
            value: 'glioma',
            description: {
              en: '(Sermorelin is contraindicated)',
              es: '(Sermorelin está contraindicado)',
            },
          },
          {
            id: 'cancer',
            label: {
              en: 'I have or have had another type of cancer or tumor',
              es: 'Tengo o he tenido otro tipo de cáncer o tumor',
            },
            value: 'cancer',
          },
        ],
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please select at least one option',
              es: 'Por favor selecciona al menos una opción',
            },
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'cancer-treatment',
    prevStep: 'medical-conditions',
    progressPercent: 72,
  },

  // ===== CANCER TREATMENT =====
  {
    id: 'cancer-treatment',
    path: 'cancer-treatment',
    title: {
      en: 'Are you currently undergoing treatment for cancer, including chemotherapy or radiation therapy?',
      es: '¿Estás actualmente en tratamiento contra el cáncer, incluyendo quimioterapia o radioterapia?',
    },
    type: 'single-select',
    fields: [
      {
        id: 'cancer_treatment',
        type: 'radio',
        label: { en: 'Cancer Treatment', es: 'Tratamiento de Cáncer' },
        storageKey: 'cancer_treatment',
        options: [
          { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
          { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'programs-include',
    prevStep: 'sermorelin-conditions',
    progressPercent: 74,
  },

  // ===== PROGRAMS INCLUDE =====
  {
    id: 'programs-include',
    path: 'programs-include',
    title: { en: 'All our programs include', es: 'Todos nuestros programas incluyen' },
    type: 'custom',
    component: 'ProgramsIncludeStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'lifestyle-factors',
    prevStep: 'cancer-treatment',
    progressPercent: 76,
  },

  // ===== LIFESTYLE FACTORS =====
  {
    id: 'lifestyle-factors',
    path: 'lifestyle-factors',
    title: {
      en: 'Do any of the following lifestyle factors apply to you?',
      es: '¿Aplica alguno de los siguientes factores de estilo de vida?',
    },
    subtitle: {
      en: 'This information is confidential and helps ensure safe prescribing.',
      es: 'Esta información es confidencial y ayuda a garantizar una prescripción segura.',
    },
    type: 'single-select',
    fields: [
      {
        id: 'lifestyle_factors',
        type: 'radio',
        label: { en: 'Lifestyle Factors', es: 'Factores de Estilo de Vida' },
        storageKey: 'lifestyle_factors',
        options: [
          {
            id: 'none',
            label: { en: 'None of these apply to me', es: 'Ninguno de estos aplica' },
            value: 'none',
          },
          {
            id: 'binge_drinking',
            label: {
              en: 'I binge drink alcohol (4 or more drinks in one sitting)',
              es: 'Bebo alcohol en exceso (4 o más bebidas en una sesión)',
            },
            value: 'binge_drinking',
          },
          {
            id: 'opiates',
            label: {
              en: 'I use opiates (prescription or non-prescription)',
              es: 'Uso opiáceos (recetados o no recetados)',
            },
            value: 'opiates',
          },
          { id: 'both', label: { en: 'Both apply to me', es: 'Ambos aplican' }, value: 'both' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'allergies',
    prevStep: 'programs-include',
    progressPercent: 78,
  },

  // ===== ALLERGIES =====
  {
    id: 'allergies',
    path: 'allergies',
    title: { en: 'Do you have any allergies?', es: '¿Tienes alguna alergia?' },
    type: 'single-select',
    fields: [
      {
        id: 'has_allergies',
        type: 'radio',
        label: { en: 'Allergies', es: 'Alergias' },
        storageKey: 'has_allergies',
        options: [
          { id: 'yes', label: { en: 'Yes', es: 'Sí' }, value: 'yes' },
          { id: 'no', label: { en: 'No', es: 'No' }, value: 'no' },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: [
      {
        conditions: [{ field: 'has_allergies', operator: 'equals', value: 'yes' }],
        target: 'allergy-details',
      },
      {
        conditions: [{ field: 'has_allergies', operator: 'equals', value: 'no' }],
        target: 'lab-work',
      },
    ],
    prevStep: 'lifestyle-factors',
    progressPercent: 80,
  },

  // ===== ALLERGY DETAILS (conditional) =====
  {
    id: 'allergy-details',
    path: 'allergy-details',
    title: { en: 'What are you allergic to?', es: '¿A qué eres alérgico?' },
    type: 'custom',
    component: 'AllergySearchStep',
    fields: [
      {
        id: 'allergy_details',
        type: 'text',
        label: { en: 'Allergy Details', es: 'Detalles de Alergia' },
        storageKey: 'allergy_details',
        validation: [
          {
            type: 'required',
            message: {
              en: 'Please add at least one allergy',
              es: 'Por favor agrega al menos una alergia',
            },
          },
        ],
      },
    ],
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
    title: {
      en: 'When was your most recent in-person medical evaluation with lab work?',
      es: '¿Cuándo fue tu evaluación médica presencial más reciente con análisis de laboratorio?',
    },
    type: 'single-select',
    fields: [
      {
        id: 'recent_lab_work',
        type: 'radio',
        label: { en: 'Recent Lab Work', es: 'Análisis Recientes' },
        storageKey: 'recent_lab_work',
        options: [
          {
            id: '3_months',
            label: { en: 'Within the last 3 months', es: 'Dentro de los últimos 3 meses' },
            value: '3_months',
          },
          {
            id: '6_months',
            label: { en: 'Within the last 6 months', es: 'Dentro de los últimos 6 meses' },
            value: '6_months',
          },
          {
            id: 'over_6_months',
            label: { en: 'Over 6 months ago', es: 'Hace más de 6 meses' },
            value: 'over_6_months',
          },
          {
            id: 'over_1_year',
            label: { en: 'Over 1 year ago', es: 'Hace más de 1 año' },
            value: 'over_1_year',
          },
          {
            id: 'never',
            label: {
              en: 'I do not remember or I have never had labs done',
              es: 'No recuerdo o nunca me han hecho análisis',
            },
            value: 'never',
          },
        ],
      },
    ],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'commitment-info',
    prevStep: 'allergies',
    progressPercent: 84,
  },

  // ===== COMMITMENT INFO =====
  {
    id: 'commitment-info',
    path: 'commitment-info',
    title: {
      en: 'We are committed to recovery, balance & long-term health',
      es: 'Estamos comprometidos con la recuperación, el equilibrio y la salud a largo plazo',
    },
    type: 'custom',
    component: 'SafetyQualityStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'referral-source',
    prevStep: 'lab-work',
    progressPercent: 86,
  },

  // ===== REFERRAL SOURCE (reuses OT pattern) =====
  {
    id: 'referral-source',
    path: 'referral-source',
    title: { en: 'How did you hear about Overtime?', es: '¿Cómo escuchaste sobre Overtime?' },
    type: 'custom',
    component: 'ReferralSourceStep',
    fields: [
      {
        id: 'referral_source',
        type: 'radio',
        label: { en: 'Referral Source', es: 'Fuente de Referencia' },
        storageKey: 'referral_source',
        options: [
          { id: 'instagram', label: { en: 'Instagram', es: 'Instagram' }, value: 'instagram' },
          { id: 'facebook', label: { en: 'Facebook', es: 'Facebook' }, value: 'facebook' },
          {
            id: 'friend_family',
            label: { en: 'Friend/Family', es: 'Amigo/Familia' },
            value: 'friend_family',
          },
          { id: 'google', label: { en: 'Google', es: 'Google' }, value: 'google' },
          { id: 'youtube', label: { en: 'Youtube', es: 'Youtube' }, value: 'youtube' },
          { id: 'tiktok', label: { en: 'Tiktok', es: 'Tiktok' }, value: 'tiktok' },
          {
            id: 'ot_rep',
            label: { en: 'Overtime Representative', es: 'Representante de Overtime' },
            value: 'ot_rep',
          },
        ],
      },
    ],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: [
      {
        conditions: [
          { field: 'referral_source', operator: 'in', value: ['friend_family', 'ot_rep'] },
        ],
        target: 'referral-name',
      },
      {
        conditions: [
          { field: 'referral_source', operator: 'notIn', value: ['friend_family', 'ot_rep'] },
        ],
        target: 'review',
      },
    ],
    prevStep: 'commitment-info',
    progressPercent: 88,
  },
  {
    id: 'referral-name',
    path: 'referral-name',
    title: {
      en: "What's the name of the person who referred you?",
      es: '¿Cuál es el nombre de la persona que te refirió?',
    },
    type: 'custom',
    component: 'ReferralNameStep',
    fields: [
      {
        id: 'referrer_name',
        type: 'text',
        label: { en: 'Referrer Name', es: 'Nombre del Referente' },
        placeholder: { en: 'Enter their name', es: 'Ingresa su nombre' },
        storageKey: 'referrer_name',
      },
    ],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'review',
    prevStep: 'referral-source',
    progressPercent: 90,
  },

  // ===== REVIEW & SUBMISSION =====
  {
    id: 'review',
    path: 'review',
    title: { en: 'Review your information', es: 'Revisa tu información' },
    subtitle: {
      en: 'Please verify the information below before submitting.',
      es: 'Por favor verifica la información antes de enviar.',
    },
    type: 'custom',
    component: 'ReviewStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: 'finding-provider',
    prevStep: 'commitment-info',
    progressPercent: 94,
  },
  {
    id: 'finding-provider',
    path: 'finding-provider',
    title: { en: 'Finding your provider...', es: 'Buscando tu proveedor...' },
    type: 'custom',
    component: 'FindingProviderStep',
    fields: [],
    autoAdvance: true,
    showContinueButton: false,
    nextStep: 'qualified',
    prevStep: 'review',
    progressPercent: 97,
  },
  {
    id: 'qualified',
    path: 'qualified',
    title: { en: 'Great news!', es: '¡Excelentes noticias!' },
    subtitle: {
      en: 'Based on your responses, you may qualify for Sermorelin therapy. A licensed provider will review your information.',
      es: 'Según tus respuestas, puedes calificar para la terapia de Sermorelin. Un proveedor licenciado revisará tu información.',
    },
    type: 'custom',
    component: 'QualifiedStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: 'book-appointment',
    prevStep: 'review',
    progressPercent: 100,
  },
  {
    id: 'book-appointment',
    path: 'book-appointment',
    title: { en: 'Book Your Appointment', es: 'Reserva Tu Cita' },
    subtitle: {
      en: 'Schedule a consultation with one of our licensed providers.',
      es: 'Programa una consulta con uno de nuestros proveedores licenciados.',
    },
    type: 'custom',
    component: 'BookAppointmentStep',
    fields: [],
    autoAdvance: false,
    showContinueButton: false,
    nextStep: null,
    prevStep: 'qualified',
    progressPercent: 100,
  },
];

export const otMensPeptideIntakeConfig: FormConfig = {
  id: 'ot-mens-peptide-intake',
  name: 'OT Mens Health Peptide Therapy Intake',
  version: '1.0.0',
  description:
    "Comprehensive medical intake for Overtime Men's Health Sermorelin/peptide therapy programs",
  treatmentType: 'peptides',
  steps,
  startStep: 'peptide-intro',
  languages: ['en'],
  defaultLanguage: 'en',
  integrations: [{ type: 'platform', triggers: ['complete'] }],
  branding: {
    logo: 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg',
    primaryColor: '#413d3d',
    accentColor: '#cab172',
    secondaryColor: '#f5ecd8',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

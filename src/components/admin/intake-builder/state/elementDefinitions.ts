/**
 * Element Palette Definitions
 *
 * Defines all available building blocks for the form builder.
 * Each definition describes how a new field/block is created when
 * dragged from the palette onto the canvas.
 */

import type { ElementDefinition } from './builderTypes';
import { createLocalizedString } from './builderTypes';

// ---------------------------------------------------------------------------
// Input Fields
// ---------------------------------------------------------------------------

const inputFields: ElementDefinition[] = [
  {
    id: 'el-short-text',
    label: 'Short Text',
    description: 'Single-line text input',
    icon: 'Type',
    category: 'input',
    fieldType: 'text',
    defaultField: {
      type: 'text',
      label: createLocalizedString('Text Field'),
      placeholder: createLocalizedString('Enter text...'),
      storageKey: 'text_field',
      validation: [],
    },
  },
  {
    id: 'el-long-text',
    label: 'Long Text',
    description: 'Multi-line textarea',
    icon: 'AlignLeft',
    category: 'input',
    fieldType: 'textarea',
    defaultField: {
      type: 'textarea',
      label: createLocalizedString('Long Text'),
      placeholder: createLocalizedString('Enter your response...'),
      storageKey: 'long_text',
      validation: [],
    },
  },
  {
    id: 'el-email',
    label: 'Email',
    description: 'Email address input',
    icon: 'Mail',
    category: 'input',
    fieldType: 'email',
    defaultField: {
      type: 'email',
      label: createLocalizedString('Email', 'Correo electrónico'),
      placeholder: createLocalizedString('your@email.com', 'tu@email.com'),
      storageKey: 'email',
      validation: [
        {
          type: 'email',
          message: createLocalizedString('Please enter a valid email', 'Ingresa un correo válido'),
        },
      ],
    },
  },
  {
    id: 'el-phone',
    label: 'Phone',
    description: 'Phone number input',
    icon: 'Phone',
    category: 'input',
    fieldType: 'phone',
    defaultField: {
      type: 'phone',
      label: createLocalizedString('Phone Number', 'Número de teléfono'),
      placeholder: createLocalizedString('(555) 555-5555'),
      storageKey: 'phone',
      validation: [
        {
          type: 'phone',
          message: createLocalizedString(
            'Please enter a valid phone number',
            'Ingresa un número válido'
          ),
        },
      ],
    },
  },
  {
    id: 'el-number',
    label: 'Number',
    description: 'Numeric input',
    icon: 'Hash',
    category: 'input',
    fieldType: 'number',
    defaultField: {
      type: 'number',
      label: createLocalizedString('Number'),
      placeholder: createLocalizedString('0'),
      storageKey: 'number_field',
      validation: [],
    },
  },
  {
    id: 'el-date',
    label: 'Date',
    description: 'Date picker',
    icon: 'Calendar',
    category: 'input',
    fieldType: 'date',
    defaultField: {
      type: 'date',
      label: createLocalizedString('Date', 'Fecha'),
      placeholder: createLocalizedString('MM/DD/YYYY', 'MM/DD/AAAA'),
      storageKey: 'date_field',
      validation: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Selection Fields
// ---------------------------------------------------------------------------

const selectionFields: ElementDefinition[] = [
  {
    id: 'el-single-choice',
    label: 'Single Choice',
    description: 'Radio buttons / option cards',
    icon: 'CircleDot',
    category: 'selection',
    fieldType: 'radio',
    stepType: 'single-select',
    defaultField: {
      type: 'radio',
      label: createLocalizedString('Choose one'),
      storageKey: 'single_choice',
      options: [
        { id: 'opt-1', label: createLocalizedString('Option 1'), value: 'option_1' },
        { id: 'opt-2', label: createLocalizedString('Option 2'), value: 'option_2' },
        { id: 'opt-3', label: createLocalizedString('Option 3'), value: 'option_3' },
      ],
    },
  },
  {
    id: 'el-multi-choice',
    label: 'Multiple Choice',
    description: 'Checkboxes / multi-select cards',
    icon: 'CheckSquare',
    category: 'selection',
    fieldType: 'checkbox',
    stepType: 'multi-select',
    defaultField: {
      type: 'checkbox',
      label: createLocalizedString('Select all that apply'),
      storageKey: 'multi_choice',
      options: [
        { id: 'opt-1', label: createLocalizedString('Option 1'), value: 'option_1' },
        { id: 'opt-2', label: createLocalizedString('Option 2'), value: 'option_2' },
        { id: 'opt-3', label: createLocalizedString('Option 3'), value: 'option_3' },
      ],
    },
  },
  {
    id: 'el-dropdown',
    label: 'Dropdown',
    description: 'Select menu',
    icon: 'ChevronDown',
    category: 'selection',
    fieldType: 'select',
    defaultField: {
      type: 'select',
      label: createLocalizedString('Select an option'),
      placeholder: createLocalizedString('Choose...', 'Elige...'),
      storageKey: 'dropdown',
      options: [
        { id: 'opt-1', label: createLocalizedString('Option 1'), value: 'option_1' },
        { id: 'opt-2', label: createLocalizedString('Option 2'), value: 'option_2' },
        { id: 'opt-3', label: createLocalizedString('Option 3'), value: 'option_3' },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Content Blocks
// ---------------------------------------------------------------------------

const contentBlocks: ElementDefinition[] = [
  {
    id: 'el-heading',
    label: 'Heading',
    description: 'Display heading text',
    icon: 'Heading',
    category: 'content',
    fieldType: 'text',
    defaultField: {
      type: 'text',
      label: createLocalizedString('Heading'),
      storageKey: '_heading',
      props: { displayOnly: true, variant: 'heading' },
    },
  },
  {
    id: 'el-paragraph',
    label: 'Paragraph',
    description: 'Display body text',
    icon: 'FileText',
    category: 'content',
    fieldType: 'text',
    defaultField: {
      type: 'text',
      label: createLocalizedString('Add your text here...'),
      storageKey: '_paragraph',
      props: { displayOnly: true, variant: 'paragraph' },
    },
  },
  {
    id: 'el-divider',
    label: 'Divider',
    description: 'Visual separator',
    icon: 'Minus',
    category: 'content',
    fieldType: 'hidden',
    defaultField: {
      type: 'hidden',
      label: createLocalizedString('Divider'),
      storageKey: '_divider',
      props: { displayOnly: true, variant: 'divider' },
    },
  },
];

// ---------------------------------------------------------------------------
// Special Fields
// ---------------------------------------------------------------------------

const specialFields: ElementDefinition[] = [
  {
    id: 'el-signature',
    label: 'Signature',
    description: 'Digital signature pad',
    icon: 'PenTool',
    category: 'special',
    fieldType: 'signature',
    defaultField: {
      type: 'signature',
      label: createLocalizedString('Signature', 'Firma'),
      storageKey: 'signature',
      validation: [
        {
          type: 'required',
          message: createLocalizedString('Signature is required', 'La firma es requerida'),
        },
      ],
    },
  },
  {
    id: 'el-file-upload',
    label: 'File Upload',
    description: 'File attachment',
    icon: 'Upload',
    category: 'special',
    fieldType: 'file',
    defaultField: {
      type: 'file',
      label: createLocalizedString('Upload File', 'Subir archivo'),
      storageKey: 'file_upload',
      validation: [],
    },
  },
  {
    id: 'el-hidden',
    label: 'Hidden Field',
    description: 'Hidden data field',
    icon: 'EyeOff',
    category: 'special',
    fieldType: 'hidden',
    defaultField: {
      type: 'hidden',
      label: createLocalizedString('Hidden Field'),
      storageKey: 'hidden_field',
    },
  },
  {
    id: 'el-consent',
    label: 'Consent',
    description: 'Terms / agreement checkbox',
    icon: 'ShieldCheck',
    category: 'special',
    fieldType: 'checkbox',
    defaultField: {
      type: 'checkbox',
      label: createLocalizedString(
        'I agree to the terms and conditions',
        'Acepto los términos y condiciones'
      ),
      storageKey: 'consent_accepted',
      validation: [
        {
          type: 'required',
          message: createLocalizedString(
            'You must accept to continue',
            'Debes aceptar para continuar'
          ),
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ELEMENT_CATEGORIES = [
  { id: 'input', label: 'Input Fields', elements: inputFields },
  { id: 'selection', label: 'Selection', elements: selectionFields },
  { id: 'content', label: 'Content', elements: contentBlocks },
  { id: 'special', label: 'Special', elements: specialFields },
] as const;

export const ALL_ELEMENTS: ElementDefinition[] = [
  ...inputFields,
  ...selectionFields,
  ...contentBlocks,
  ...specialFields,
];

export function getElementDefinition(elementId: string): ElementDefinition | undefined {
  return ALL_ELEMENTS.find((el) => el.id === elementId);
}

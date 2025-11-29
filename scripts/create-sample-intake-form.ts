#!/usr/bin/env npx tsx
/**
 * Create a sample intake form template for testing
 */

import { prisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function createSampleIntakeForm() {
  try {
    logger.info('Creating sample intake form template...');

    // Create the template
    const template = await prisma.intakeFormTemplate.create({
      data: {
        name: 'Patient Medical History Form',
        description: 'Comprehensive medical history intake for new patients',
        treatmentType: 'General',
        isActive: true,
        metadata: {
          version: '1.0',
          category: 'Medical History'
        },
        questions: {
          create: [
            {
              questionText: 'What is your full name?',
              questionType: 'text',
              isRequired: true,
              section: 'Personal Information',
              orderIndex: 1,
              placeholder: 'Enter your full name'
            },
            {
              questionText: 'What is your date of birth?',
              questionType: 'date',
              isRequired: true,
              section: 'Personal Information',
              orderIndex: 2
            },
            {
              questionText: 'What is your email address?',
              questionType: 'email',
              isRequired: true,
              section: 'Personal Information',
              orderIndex: 3,
              placeholder: 'your@email.com'
            },
            {
              questionText: 'What is your phone number?',
              questionType: 'phone',
              isRequired: true,
              section: 'Personal Information',
              orderIndex: 4,
              placeholder: '(555) 555-5555'
            },
            {
              questionText: 'Do you have any known allergies?',
              questionType: 'radio',
              isRequired: true,
              section: 'Medical History',
              orderIndex: 5,
              options: ['Yes', 'No']
            },
            {
              questionText: 'If yes, please list your allergies:',
              questionType: 'textarea',
              isRequired: false,
              section: 'Medical History',
              orderIndex: 6,
              placeholder: 'List any medications, foods, or other allergies'
            },
            {
              questionText: 'Are you currently taking any medications?',
              questionType: 'radio',
              isRequired: true,
              section: 'Medical History',
              orderIndex: 7,
              options: ['Yes', 'No']
            },
            {
              questionText: 'If yes, please list your current medications:',
              questionType: 'textarea',
              isRequired: false,
              section: 'Medical History',
              orderIndex: 8,
              placeholder: 'List all medications and dosages'
            },
            {
              questionText: 'Have you had any surgeries or hospitalizations?',
              questionType: 'radio',
              isRequired: true,
              section: 'Medical History',
              orderIndex: 9,
              options: ['Yes', 'No']
            },
            {
              questionText: 'If yes, please provide details:',
              questionType: 'textarea',
              isRequired: false,
              section: 'Medical History',
              orderIndex: 10,
              placeholder: 'Include dates and procedures'
            },
            {
              questionText: 'Please select any conditions that apply to you or your family:',
              questionType: 'checkbox',
              isRequired: false,
              section: 'Family History',
              orderIndex: 11,
              options: [
                'Diabetes',
                'Heart Disease',
                'High Blood Pressure',
                'Cancer',
                'Stroke',
                'Kidney Disease',
                'Thyroid Problems',
                'Mental Health Conditions',
                'None of the above'
              ]
            },
            {
              questionText: 'What is the primary reason for your visit today?',
              questionType: 'textarea',
              isRequired: true,
              section: 'Current Visit',
              orderIndex: 12,
              placeholder: 'Describe your symptoms or reason for visit'
            },
            {
              questionText: 'How would you rate your current pain level?',
              questionType: 'select',
              isRequired: false,
              section: 'Current Visit',
              orderIndex: 13,
              options: ['0 - No pain', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10 - Severe pain']
            },
            {
              questionText: 'Emergency Contact Name',
              questionType: 'text',
              isRequired: true,
              section: 'Emergency Contact',
              orderIndex: 14,
              placeholder: 'Full name of emergency contact'
            },
            {
              questionText: 'Emergency Contact Phone',
              questionType: 'phone',
              isRequired: true,
              section: 'Emergency Contact',
              orderIndex: 15,
              placeholder: '(555) 555-5555'
            },
            {
              questionText: 'Relationship to Emergency Contact',
              questionType: 'select',
              isRequired: true,
              section: 'Emergency Contact',
              orderIndex: 16,
              options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other']
            }
          ]
        }
      },
      include: {
        questions: true
      }
    });

    logger.info('✅ Sample intake form template created successfully!');
    logger.info(`   Template ID: ${template.id}`);
    logger.info(`   Name: ${template.name}`);
    logger.info(`   Questions: ${template.questions.length}`);
    logger.info('');
    logger.info('You can now:');
    logger.info(`1. Preview the form at: http://localhost:3001/intake/preview/${template.id}`);
    logger.info('2. Send the form to patients from: http://localhost:3001/intake-forms');
    logger.info('3. View the form in the Intake Forms page');

  } catch (error) {
    logger.error('Failed to create sample intake form', error);
    logger.error('❌ Failed to create sample intake form:', error);
    process.exit(1);
  }
}

// Run the function
createSampleIntakeForm()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });

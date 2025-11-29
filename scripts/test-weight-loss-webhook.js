import { logger } from '../src/lib/logger';

const https = require('https');

async function sendWeightLossIntake() {
  const webhookData = {
    submissionId: `weight-loss-${Date.now()}`,
    timestamp: new Date().toISOString(),
    data: {
      // Patient Demographics
      "First Name": "Viviana",
      "Last Name": "Maltby",
      "Email": "vivianamaltby@bellsouth.net",
      "Phone": "3362296711",
      "Date of Birth": "02/09/1952",
      "Gender": "Female",
      "Street Address": "112 West Elm Street",
      "City": "Graham",
      "State": "NC",
      "ZIP Code": "27253",
      
      // Weight Loss Goals
      "Ideal Weight": "135",
      "Starting Weight": "170",
      "Pounds to Lose": "35",
      "BMI": "31.09",
      
      // Motivation
      "How would your life change by losing weight?": "Enjoying how your clothes fit, Having more confidence, Getting your energy back, Feeling better about yourself, Improving your overall health",
      "Marketing Consent": true,
      
      // Lifestyle & Activity
      "Daily Physical Activity": "1-Not Active",
      
      // Medical History
      "Chronic Illness": "Yes",
      "Type 2 Diabetes": "No",
      "Pregnant or Breastfeeding": "No",
      "Surgeries or Procedures": "No, none of these",
      "Blood Pressure": "Less than 120/80",
      
      // Specific Conditions
      "Chronic Diseases": "No, none of these",
      "Have you been diagnosed with any of the following conditions?": "Obstructive Sleep Apnea",
      "Have you or any of your family members ever been diagnosed with any of the following conditions?": "No, none of these",
      "Do you have a personal history of medullary thyroid cancer?": "No",
      "Do you have a personal history of multiple endocrine neoplasia type-2?": "No",
      "Do you have a personal history of medullary thyroid cancer?1": "No",
      "Do you have a personal history of gastroparesis (delayed stomach emptying)?": "No",
      "Have you ever undergone any surgeries or medical procedures?": "Yes",
      
      // GLP-1 History
      "Are you currently taking, or have you ever taken, a GLP-1 medication?": "I have never taken a GLP-1 medication",
      "Do you usually present side effects when starting a new medication?": "I don't experience side effects",
      
      // Legal & Consent
      "Select the state you live in": "North Carolina",
      "By clicking this box, I acknowledge": true,
      
      // Additional
      "How did you hear about us?": "Facebook",
      
      // Tags
      "tags": ["#weightloss", "#glp1-candidate", "#bmi-over-30"]
    }
  };
  
  const payload = JSON.stringify(webhookData);
  
  // Use ngrok URL
  const webhookUrl = 'https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake';
  logger.info(`🚀 Sending weight loss patient intake to ${webhookUrl}`);
  logger.info('📦 Patient:', webhookData.data["First Name"], webhookData.data["Last Name"]);
  logger.info('📊 BMI:', webhookData.data.BMI);
  logger.info('🎯 Weight Goal:', webhookData.data["Starting Weight"], 'lbs →', webhookData.data["Ideal Weight"], 'lbs');
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-heyflow-secret': process.env.HEYFLOW_SECRET || 'test-secret',
        'User-Agent': 'Heyflow/1.0'
      },
      body: payload
    });
    
    const result = await response.json();
    
    if (response.ok) {
      logger.info('✅ Success! Response:', result);
      logger.info('\n📋 Next steps:');
      logger.info(`1. View patient profile: http://localhost:3005/patients/${result.patientId}`);
      logger.info(`2. Check SOAP Note tab for AI-generated weight loss evaluation`);
      logger.info(`3. Verify Medical Necessity note for compounded GLP-1 is included`);
    } else {
      logger.error('❌ Error:', result);
    }
  } catch (error) {
    logger.error('❌ Request failed:', error.message);
  }
}

sendWeightLossIntake();

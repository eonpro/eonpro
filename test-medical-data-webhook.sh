#!/bin/bash

echo "Testing Heyflow Webhook with COMPREHENSIVE Medical Data..."
echo "This test includes all medical fields to ensure they appear in the PDF"
echo ""

# Generate unique submission ID
SUBMISSION_ID="medical-test-$(date +%s)"

curl -X POST http://localhost:3001/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: ${MEDLINK_WEBHOOK_SECRET:-heyflow-dev-secret}" \
  -d '{
    "submissionId": "'$SUBMISSION_ID'",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "data": {
      "First Name": "TestPatient",
      "Last Name": "WithMedicalData",
      "Email": "medical.test@example.com",
      "Phone": "555-0199",
      "Date of Birth": "01/15/1985",
      "Gender": "Female",
      "Street Address": "456 Medical Center Blvd",
      "City": "Tampa",
      "State": "FL",
      "ZIP Code": "33602",
      
      "Chief Complaint": "Weight management consultation for GLP-1 therapy",
      "Current Medications": "Metformin 1000mg twice daily, Lisinopril 10mg daily, Atorvastatin 20mg daily",
      "Allergies": "Penicillin (rash), Sulfa drugs (hives)",
      "Medical Conditions": "Type 2 Diabetes (diagnosed 2020), Hypertension (diagnosed 2018), Hyperlipidemia",
      "Previous Weight Loss Medications": "Phentermine (2019) - discontinued due to increased heart rate",
      "Surgical History": "Appendectomy (2015), C-section (2012)",
      "Family Medical History": "Mother: Type 2 Diabetes, Father: Hypertension and Heart Disease, Sister: PCOS",
      
      "Current Weight": "195 lbs",
      "Goal Weight": "155 lbs",
      "Height": "5 feet 6 inches",
      "BMI": "31.5",
      "Blood Pressure": "135/85",
      "Heart Rate": "78 bpm",
      "Exercise Frequency": "2-3 times per week, 30 minutes cardio",
      "Diet Type": "Low carb, trying to follow diabetic diet",
      
      "Mental Health History": "Anxiety disorder, currently managed with therapy",
      "Depression Screening": "PHQ-9 score: 8 (mild depression)",
      "Sleep Patterns": "6-7 hours per night, occasional insomnia",
      "Stress Level": "Moderate to high due to work",
      "Tobacco Use": "Never smoker",
      "Alcohol Use": "Social drinker, 2-3 drinks per week",
      
      "GLP-1 Interest": "Very interested in Semaglutide or Tirzepatide",
      "Previous GLP-1 Experience": "None",
      "Contraindications Check": "No history of pancreatitis, thyroid cancer, or MEN syndrome",
      "Pregnancy Status": "Not pregnant, using birth control",
      "Breastfeeding": "No",
      
      "Insurance": "Blue Cross Blue Shield PPO",
      "Pharmacy Preference": "CVS Pharmacy on Main Street",
      "Emergency Contact": "John WithMedicalData (spouse) - 555-0200",
      
      "Additional Medical Notes": "Patient reports good medication compliance. Interested in comprehensive weight management program including nutrition counseling. Has tried multiple diets with temporary success. Last A1C was 7.2%. Recent lipid panel shows improvement on statin therapy.",
      
      "Consent Given": "Yes",
      "Telehealth Consent": "Yes",
      "HIPAA Authorization": "Yes"
    }
  }' \
  -w "\n\nHTTP Status: %{http_code}\nResponse Time: %{time_total}s\n"

echo ""
echo "========================================="
echo "Test submitted with ID: $SUBMISSION_ID"
echo ""
echo "To verify the PDF contains medical data:"
echo "1. Check the patient in the system"
echo "2. Download the PDF from the patient documents"
echo "3. Verify ALL medical fields are present"
echo ""
echo "Check logs for processing details:"
echo "tail -100 /Users/italo/.cursor/projects/Users-italo-Desktop-lifefile-integration/terminals/*.txt | grep MEDLINK"

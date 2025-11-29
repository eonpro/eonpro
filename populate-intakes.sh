#!/bin/bash

echo "Populating database with sample intakes..."

# Intake 1 - Sandra Soltero
curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "test-sandra-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "I want to feel more confident and have more energy for my family"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "Sandra"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "Soltero"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "03/15/1985"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "sandra.soltero@example.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "8135551234"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "{\"street\": \"456 Oak Avenue\", \"city\": \"Tampa\", \"state\": \"FL\", \"zip\": \"33605\"}"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Female"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "195"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "155"
      },
      {
        "id": "id-3a7e6f11",
        "label": "Height (feet)",
        "value": "5"
      },
      {
        "id": "id-4a4a1f48",
        "label": "Height (inches)",
        "value": "6"
      },
      {
        "id": "BMI",
        "label": "BMI",
        "value": "31.5"
      }
    ]
  }'

echo ""
sleep 2

# Intake 2 - Michael Johnson
curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "test-michael-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "Better health, reduce diabetes risk, more active lifestyle"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "Michael"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "Johnson"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "07/22/1978"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "mjohnson78@gmail.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "7275559876"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "{\"street\": \"789 Pine Street\", \"city\": \"St Petersburg\", \"state\": \"FL\", \"zip\": \"33701\"}"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Male"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "220"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "180"
      },
      {
        "id": "id-3a7e6f11",
        "label": "Height (feet)",
        "value": "5"
      },
      {
        "id": "id-4a4a1f48",
        "label": "Height (inches)",
        "value": "10"
      },
      {
        "id": "BMI",
        "label": "BMI",
        "value": "31.6"
      }
    ]
  }'

echo ""
sleep 2

# Intake 3 - Maria Rodriguez
curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "test-maria-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "Improve self-esteem, fit into my old clothes, have more energy"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "Maria"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "Rodriguez"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "11/30/1990"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "maria.rodriguez90@hotmail.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "3055552468"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "{\"street\": \"321 Elm Court\", \"city\": \"Miami\", \"state\": \"FL\", \"zip\": \"33125\"}"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Female"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "165"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "135"
      },
      {
        "id": "id-3a7e6f11",
        "label": "Height (feet)",
        "value": "5"
      },
      {
        "id": "id-4a4a1f48",
        "label": "Height (inches)",
        "value": "4"
      },
      {
        "id": "BMI",
        "label": "BMI",
        "value": "28.3"
      }
    ]
  }'

echo ""
sleep 2

# Intake 4 - Robert Chen
curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "test-robert-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "Lower blood pressure, reduce joint pain, improve overall health"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "Robert"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "Chen"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "05/18/1982"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "rchen82@yahoo.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "4075553690"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "{\"street\": \"567 Maple Drive\", \"city\": \"Orlando\", \"state\": \"FL\", \"zip\": \"32801\"}"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Male"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "245"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "190"
      },
      {
        "id": "id-3a7e6f11",
        "label": "Height (feet)",
        "value": "6"
      },
      {
        "id": "id-4a4a1f48",
        "label": "Height (inches)",
        "value": "0"
      },
      {
        "id": "BMI",
        "label": "BMI",
        "value": "33.2"
      }
    ]
  }'

echo ""
echo "Done! Added 4 sample intakes to the database."
echo "Check http://localhost:5001/intakes to see them."

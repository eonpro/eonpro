#!/bin/bash

echo "Testing address field filtering..."

curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "address-test-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "I want to be healthier and more active"
      },
      {
        "id": "id-f69d896b",
        "label": "By clicking this box, I acknowledge that I have read, understood, and agree to the Terms of Use",
        "value": "true"
      },
      {
        "id": "id-49256866",
        "label": "18+ Disclosure : By submitting this form. I certify that I am over 18 years of age and that the date of birth provided in this form is legitimate and it belongs to me.",
        "value": "true"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "David"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "Wilson"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "04/12/1982"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "dwilson@example.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "8055551234"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "2537 Oak Crest Drive, Santa Barbara, CA, USA"
      },
      {
        "id": "id-38a5bae0-country",
        "label": "address [country]",
        "value": "Estados Unidos"
      },
      {
        "id": "id-38a5bae0-state",
        "label": "address [state]",
        "value": "California"
      },
      {
        "id": "id-38a5bae0-city",
        "label": "address [city]",
        "value": "Santa Barbara"
      },
      {
        "id": "id-38a5bae0-zip",
        "label": "address [zip]",
        "value": "93105"
      },
      {
        "id": "id-38a5bae0-street",
        "label": "address [street]",
        "value": "Oak Crest Drive"
      },
      {
        "id": "id-38a5bae0-house",
        "label": "address [house]",
        "value": "2537"
      },
      {
        "id": "id-38a5bae0-state_code",
        "label": "address [state_code]",
        "value": "CA"
      },
      {
        "id": "id-38a5bae0-latitude",
        "label": "address [latitude]",
        "value": "34.4289598"
      },
      {
        "id": "id-38a5bae0-longitude",
        "label": "address [longitude]",
        "value": "-119.7288721"
      },
      {
        "id": "id-0d142f9e",
        "label": "apartment#",
        "value": "Duplex"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Male"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "210"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "175"
      }
    ]
  }' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "Check the PDF to verify:"
echo "1. Only main address, zip code, and apartment# are shown"
echo "2. Checkboxes show ✓ instead of 'Yes'"

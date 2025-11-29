#!/bin/bash

echo "Testing Heyflow Webhook..."
echo "URL: https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake"
echo "Secret: heyflow-dev-secret"
echo ""

curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "submissionId": "test-'$(date +%s)'",
    "submittedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "sections": [],
    "answers": [
      {
        "id": "id-3fa4d158",
        "label": "How would your life change by losing weight?",
        "value": "Test submission - I want to feel healthier"
      },
      {
        "id": "id-b1679347",
        "label": "firstname",
        "value": "Test"
      },
      {
        "id": "id-30d7dea8",
        "label": "lastname",
        "value": "User"
      },
      {
        "id": "id-01a47886",
        "label": "dob",
        "value": "01/01/1990"
      },
      {
        "id": "id-62de7872",
        "label": "email",
        "value": "test@example.com"
      },
      {
        "id": "phone-input-id-cc54007b",
        "label": "phone",
        "value": "5551234567"
      },
      {
        "id": "id-38a5bae0",
        "label": "address",
        "value": "{\"street\": \"123 Test St\", \"city\": \"Tampa\", \"state\": \"FL\", \"zip\": \"33601\"}"
      },
      {
        "id": "id-19e348ba",
        "label": "gender",
        "value": "Male"
      },
      {
        "id": "id-703227a8",
        "label": "Starting Weight",
        "value": "180"
      },
      {
        "id": "id-cf20e7c9",
        "label": "Ideal Weight",
        "value": "160"
      }
    ]
  }' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "Check the logs with: docker logs lifefile-platform --tail 20"

#!/bin/bash

echo "Testing with real Heyflow format..."

# Test format 1: Fields at root level (like Heyflow v2)
curl -X POST https://83de6193bbfe.ngrok-free.app/api/webhooks/heyflow-intake \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: heyflow-dev-secret" \
  -d '{
    "responseId": "real-heyflow-test-'$(date +%s)'",
    "createdAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "id-b1679347": "Jennifer",
    "id-30d7dea8": "Martinez",
    "id-01a47886": "06/15/1988",
    "id-62de7872": "jmartinez88@gmail.com",
    "phone-input-id-cc54007b": "3055557890",
    "id-38a5bae0": "{\"street\": \"123 Biscayne Blvd\", \"city\": \"Miami\", \"state\": \"FL\", \"zip\": \"33132\"}",
    "id-19e348ba": "Female",
    "id-703227a8": "175",
    "id-cf20e7c9": "145",
    "id-3a7e6f11": "5",
    "id-4a4a1f48": "5",
    "BMI": "28.5",
    "id-3fa4d158": "I want to feel more confident and have more energy"
  }' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "Check docker logs to see how the payload was processed:"
echo "docker logs lifefile-platform --tail 50"

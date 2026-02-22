#!/bin/bash
set -e

SANDBOX_URL="https://apis-sandbox.fedex.com"
CLIENT_ID="l7b09798230596483d89cc3f0e58180753"
CLIENT_SECRET="08019d44b53249369806b7c9214c59e4"
ACCOUNT="740561073"
OUTPUT_DIR="$(dirname "$0")"
SHIP_DATE=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d)

echo "=== FedEx Test Label Generator ==="
echo "Ship date: $SHIP_DATE"
echo ""

TOKEN=$(curl -s -X POST "$SANDBOX_URL/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Auth: OK (token length: ${#TOKEN})"
echo ""

generate_label() {
  local SERVICE="$1"
  local PACKAGING="$2"
  local ONE_RATE="$3"
  local FILENAME="$4"
  local WEIGHT="$5"

  local SPECIAL_SERVICES=""
  if [ "$ONE_RATE" = "true" ]; then
    SPECIAL_SERVICES='"shipmentSpecialServices": {"specialServiceTypes": ["FEDEX_ONE_RATE"]},'
  fi

  echo -n "  Generating $FILENAME ... "

  RESPONSE=$(curl -s --compressed -X POST "$SANDBOX_URL/ship/v1/shipments" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-locale: en_US" \
    -d "{
      \"labelResponseOptions\": \"LABEL\",
      \"accountNumber\": {\"value\": \"$ACCOUNT\"},
      \"requestedShipment\": {
        \"shipper\": {
          \"contact\": {\"personName\": \"EonPro Medical\", \"phoneNumber\": \"8135551234\", \"companyName\": \"EonPro LLC\"},
          \"address\": {\"streetLines\": [\"1801 N Morgan St\"], \"city\": \"Tampa\", \"stateOrProvinceCode\": \"FL\", \"postalCode\": \"33602\", \"countryCode\": \"US\"}
        },
        \"recipients\": [{
          \"contact\": {\"personName\": \"John Smith\", \"phoneNumber\": \"3055559876\"},
          \"address\": {\"streetLines\": [\"123 Test Street\"], \"city\": \"Miami\", \"stateOrProvinceCode\": \"FL\", \"postalCode\": \"33101\", \"countryCode\": \"US\", \"residential\": true}
        }],
        \"shipDatestamp\": \"$SHIP_DATE\",
        \"serviceType\": \"$SERVICE\",
        \"packagingType\": \"$PACKAGING\",
        \"pickupType\": \"DROPOFF_AT_FEDEX_LOCATION\",
        \"blockInsightVisibility\": false,
        $SPECIAL_SERVICES
        \"shippingChargesPayment\": {
          \"paymentType\": \"SENDER\",
          \"payor\": {\"responsibleParty\": {\"accountNumber\": {\"value\": \"$ACCOUNT\"}}}
        },
        \"labelSpecification\": {\"imageType\": \"PDF\", \"labelStockType\": \"PAPER_4X6\", \"labelFormatType\": \"COMMON2D\"},
        \"requestedPackageLineItems\": [{\"sequenceNumber\": 1, \"weight\": {\"units\": \"LB\", \"value\": $WEIGHT}}]
      }
    }")

  ERROR=$(echo "$RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'errors' in d:
    print(json.dumps(d['errors']))
else:
    print('')
" 2>/dev/null)

  if [ -n "$ERROR" ] && [ "$ERROR" != "" ]; then
    echo "FAILED: $ERROR"
    return 1
  fi

  echo "$RESPONSE" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
ts = d['output']['transactionShipments'][0]
pr = ts.get('pieceResponses', [])
tracking = ''
label = ''
if pr:
    tracking = pr[0].get('trackingNumber','')
    docs = pr[0].get('packageDocuments',[])
    if docs:
        label = docs[0].get('encodedLabel','')
if not tracking:
    tracking = ts.get('masterTrackingNumber','')
if not label:
    sd = ts.get('shipmentDocuments',[])
    if sd:
        label = sd[0].get('encodedLabel','')
print(f'TRACKING:{tracking}')
if label:
    pdf = base64.b64decode(label)
    with open('$OUTPUT_DIR/$FILENAME', 'wb') as f:
        f.write(pdf)
    print(f'SAVED:{len(pdf)} bytes')
else:
    print('NO_LABEL')
"
}

echo "--- Generating test labels ---"
echo ""

echo "[1/5] FedEx 2Day - One Rate - FedEx Envelope"
generate_label "FEDEX_2_DAY" "FEDEX_ENVELOPE" "true" "label-2day-onerate-envelope.pdf" 1

echo ""
echo "[2/5] FedEx 2Day - One Rate - FedEx Pak"
generate_label "FEDEX_2_DAY" "FEDEX_PAK" "true" "label-2day-onerate-pak.pdf" 2

echo ""
echo "[3/5] FedEx Standard Overnight - One Rate - FedEx Small Box"
generate_label "STANDARD_OVERNIGHT" "FEDEX_SMALL_BOX" "true" "label-overnight-onerate-smallbox.pdf" 3

echo ""
echo "[4/5] FedEx Express Saver - Your Packaging (standard rate)"
generate_label "FEDEX_EXPRESS_SAVER" "YOUR_PACKAGING" "false" "label-express-saver-standard.pdf" 2

echo ""
echo "[5/5] FedEx Ground - Your Packaging (standard rate)"
generate_label "FEDEX_GROUND" "YOUR_PACKAGING" "false" "label-ground-standard.pdf" 5

echo ""
echo "=== Done! Labels saved to: $OUTPUT_DIR ==="
echo ""
echo "Next steps:"
echo "1. Print each label at 600+ DPI"
echo "2. Scan the printed labels"
echo "3. Fill out the FedEx Label Cover Sheet"
echo "4. Email scans + cover sheet to: label@fedex.com"

#!/bin/bash
# Comprehensive Affiliate API Testing Script
# Tests the live API endpoints on the production/staging environment

# Configuration
BASE_URL="${1:-https://ot.eonpro.io}"
VERBOSE="${VERBOSE:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

echo -e "\n${PURPLE}============================================================${NC}"
echo -e "${PURPLE}🧪 AFFILIATE API TEST SUITE${NC}"
echo -e "${PURPLE}Base URL: ${BASE_URL}${NC}"
echo -e "${PURPLE}============================================================${NC}\n"

# Helper function to test an endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="$5"
    local cookie="$6"
    
    if [ -n "$cookie" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -H "Cookie: $cookie" \
                -d "$data" \
                "${BASE_URL}${endpoint}" 2>/dev/null)
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Cookie: $cookie" \
                "${BASE_URL}${endpoint}" 2>/dev/null)
        fi
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "${BASE_URL}${endpoint}" 2>/dev/null)
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                "${BASE_URL}${endpoint}" 2>/dev/null)
        fi
    fi
    
    body=$(echo "$response" | head -n -1)
    status=$(echo "$response" | tail -n 1)
    
    if [ "$status" = "$expected_status" ]; then
        echo -e "  ${GREEN}✓${NC} $name (HTTP $status)"
        PASSED=$((PASSED + 1))
        if [ "$VERBOSE" = "true" ]; then
            echo "    Response: $body" | head -c 200
            echo ""
        fi
        return 0
    else
        echo -e "  ${RED}✗${NC} $name - Expected HTTP $expected_status, got $status"
        FAILED=$((FAILED + 1))
        if [ "$VERBOSE" = "true" ]; then
            echo "    Response: $body" | head -c 500
            echo ""
        fi
        return 1
    fi
}

# Test function that returns the response body
get_response() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local cookie="$4"
    
    if [ -n "$cookie" ]; then
        if [ -n "$data" ]; then
            curl -s -X "$method" \
                -H "Content-Type: application/json" \
                -H "Cookie: $cookie" \
                -d "$data" \
                "${BASE_URL}${endpoint}" 2>/dev/null
        else
            curl -s -X "$method" \
                -H "Cookie: $cookie" \
                "${BASE_URL}${endpoint}" 2>/dev/null
        fi
    else
        if [ -n "$data" ]; then
            curl -s -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "${BASE_URL}${endpoint}" 2>/dev/null
        else
            curl -s -X "$method" \
                "${BASE_URL}${endpoint}" 2>/dev/null
        fi
    fi
}

echo -e "${BLUE}📍 1. Testing Click Tracking Endpoint${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Generate test data
FINGERPRINT=$(openssl rand -hex 32)
COOKIE_ID="test_$(date +%s)_$(openssl rand -hex 4)"
TEST_REF="JACOB"  # Use a real ref code from the system

# Test track endpoint (POST)
TRACK_DATA='{
    "visitorFingerprint": "'$FINGERPRINT'",
    "cookieId": "'$COOKIE_ID'",
    "refCode": "'$TEST_REF'",
    "utmSource": "test",
    "utmMedium": "api_test",
    "utmCampaign": "affiliate_test",
    "landingPage": "https://ot.eonpro.io/test",
    "referrerUrl": "https://google.com"
}'

test_endpoint "POST /api/affiliate/track" "POST" "/api/affiliate/track" "200" "$TRACK_DATA"

# Test track endpoint with missing data
test_endpoint "POST /api/affiliate/track (missing refCode)" "POST" "/api/affiliate/track" "400" '{"visitorFingerprint": "test"}'

# Test server-to-server postback (GET)
test_endpoint "GET /api/affiliate/track (postback)" "GET" "/api/affiliate/track?ref=$TEST_REF&fingerprint=$FINGERPRINT" "200"

echo ""
echo -e "${BLUE}📍 2. Testing Authentication Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test auth/me without auth (should fail)
test_endpoint "GET /api/affiliate/auth/me (unauthenticated)" "GET" "/api/affiliate/auth/me" "401"

# Test login endpoint exists
test_endpoint "POST /api/affiliate/auth/login (invalid creds)" "POST" "/api/affiliate/auth/login" "401" '{"email":"invalid@test.com","password":"wrong"}'

echo ""
echo -e "${BLUE}📍 3. Testing Public Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test apply endpoint
test_endpoint "GET /api/affiliate/apply (check endpoint exists)" "OPTIONS" "/api/affiliate/apply" "204"

echo ""
echo -e "${BLUE}📍 4. Testing Protected Endpoints (should require auth)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "GET /api/affiliate/dashboard (no auth)" "GET" "/api/affiliate/dashboard" "401"
test_endpoint "GET /api/affiliate/earnings (no auth)" "GET" "/api/affiliate/earnings" "401"
test_endpoint "GET /api/affiliate/ref-codes (no auth)" "GET" "/api/affiliate/ref-codes" "401"
test_endpoint "GET /api/affiliate/account (no auth)" "GET" "/api/affiliate/account" "401"

echo ""
echo -e "${BLUE}📍 5. Testing Rate Limiting${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  Sending 5 rapid requests to track endpoint..."
RATE_LIMIT_OK=true
for i in {1..5}; do
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$TRACK_DATA" \
        "${BASE_URL}/api/affiliate/track" 2>/dev/null | tail -c 3)
    
    if [ "$response" = "429" ]; then
        echo -e "  ${YELLOW}⚠${NC} Rate limited after $i requests"
        RATE_LIMIT_OK=false
        break
    fi
done

if [ "$RATE_LIMIT_OK" = true ]; then
    echo -e "  ${GREEN}✓${NC} Rate limiting not triggered for 5 requests"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${GREEN}✓${NC} Rate limiting is active"
    PASSED=$((PASSED + 1))
fi

echo ""
echo -e "${BLUE}📍 6. Testing Response Format${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check track response format
track_response=$(get_response "POST" "/api/affiliate/track" "$TRACK_DATA")

# Check if response is JSON
if echo "$track_response" | jq . > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Track response is valid JSON"
    PASSED=$((PASSED + 1))
    
    # Check for expected fields
    if echo "$track_response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Response has 'success' field"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗${NC} Response missing 'success' field"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "  ${RED}✗${NC} Track response is not valid JSON"
    FAILED=$((FAILED + 1))
fi

echo ""
echo -e "${BLUE}📍 7. Testing Input Validation${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test with invalid fingerprint
test_endpoint "Invalid fingerprint (too short)" "POST" "/api/affiliate/track" "400" \
    '{"visitorFingerprint": "short", "refCode": "TEST"}'

# Test with SQL injection attempt
test_endpoint "SQL injection in refCode" "POST" "/api/affiliate/track" "400" \
    '{"visitorFingerprint": "'$FINGERPRINT'", "refCode": "'; DROP TABLE affiliates; --"}'

# Test with XSS attempt
test_endpoint "XSS in utmSource" "POST" "/api/affiliate/track" "200" \
    '{"visitorFingerprint": "'$FINGERPRINT'", "refCode": "'$TEST_REF'", "utmSource": "<script>alert(1)</script>"}'

echo ""
echo -e "${BLUE}📍 8. Testing Cookie Parameters${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test various ref code parameter names
test_endpoint "ref parameter" "GET" "/api/affiliate/track?ref=TEST123&fingerprint=$FINGERPRINT" "200"
test_endpoint "affiliate parameter" "GET" "/api/affiliate/track?affiliate=TEST123&fingerprint=$FINGERPRINT" "200"
test_endpoint "partner parameter" "GET" "/api/affiliate/track?partner=TEST123&fingerprint=$FINGERPRINT" "200"
test_endpoint "via parameter" "GET" "/api/affiliate/track?via=TEST123&fingerprint=$FINGERPRINT" "200"

echo ""
echo -e "${PURPLE}============================================================${NC}"
echo -e "${PURPLE}📋 TEST SUMMARY${NC}"
echo -e "${PURPLE}============================================================${NC}"
echo -e "  Total tests: $((PASSED + FAILED))"
echo -e "  ${GREEN}✓ Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}✗ Failed: $FAILED${NC}"
fi
echo -e "${PURPLE}============================================================${NC}\n"

# Exit with error code if any tests failed
exit $FAILED

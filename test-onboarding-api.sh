#!/bin/bash

# Test script to verify onboarding API endpoints are working
# Usage: bash test-onboarding-api.sh

echo "========================================"
echo "Testing Onboarding API Endpoints"
echo "========================================"
echo ""

# Set your API URL (change this to your actual backend URL)
API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3001}"

echo "Using API URL: $API_URL"
echo ""

# Test 1: Get all onboarding sections
echo "Test 1: GET /onboarding/sections"
echo "----------------------------------------"
curl -s "$API_URL/onboarding/sections" | head -100
echo ""
echo ""

# Test 2: Count sections
echo "Test 2: Count total sections"
echo "----------------------------------------"
SECTION_COUNT=$(curl -s "$API_URL/onboarding/sections" | grep -o '"id"' | wc -l)
echo "Total sections found: $SECTION_COUNT"
echo "Expected: 15"
echo ""

# Test 3: Get tool-sop sections only
echo "Test 3: GET /onboarding/sections?category=tool-sop"
echo "----------------------------------------"
TOOL_COUNT=$(curl -s "$API_URL/onboarding/sections?category=tool-sop" | grep -o '"id"' | wc -l)
echo "Tool SOP sections found: $TOOL_COUNT"
echo "Expected: 9"
echo ""

# Test 4: Get general-sop sections only
echo "Test 4: GET /onboarding/sections?category=general-sop"
echo "----------------------------------------"
GENERAL_COUNT=$(curl -s "$API_URL/onboarding/sections?category=general-sop" | grep -o '"id"' | wc -l)
echo "General SOP sections found: $GENERAL_COUNT"
echo "Expected: 6"
echo ""

# Test 5: Get training videos
echo "Test 5: GET /training/videos"
echo "----------------------------------------"
VIDEO_COUNT=$(curl -s "$API_URL/training/videos" | grep -o '"id"' | wc -l)
echo "Training videos found: $VIDEO_COUNT"
echo "Expected: 0 (unless you added some)"
echo ""

echo "========================================"
echo "Test Summary"
echo "========================================"
if [ "$SECTION_COUNT" -eq 15 ]; then
    echo "✅ Onboarding sections: PASS ($SECTION_COUNT/15)"
else
    echo "❌ Onboarding sections: FAIL ($SECTION_COUNT/15)"
fi

if [ "$TOOL_COUNT" -eq 9 ]; then
    echo "✅ Tool SOP sections: PASS ($TOOL_COUNT/9)"
else
    echo "❌ Tool SOP sections: FAIL ($TOOL_COUNT/9)"
fi

if [ "$GENERAL_COUNT" -eq 6 ]; then
    echo "✅ General SOP sections: PASS ($GENERAL_COUNT/6)"
else
    echo "❌ General SOP sections: FAIL ($GENERAL_COUNT/6)"
fi

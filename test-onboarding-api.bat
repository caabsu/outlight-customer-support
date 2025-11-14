@echo off
REM Test script to verify onboarding API endpoints are working
REM Usage: test-onboarding-api.bat [API_URL]

echo ========================================
echo Testing Onboarding API Endpoints
echo ========================================
echo.

REM Set API URL (use parameter or default to localhost)
if "%1"=="" (
    set API_URL=http://localhost:3001
) else (
    set API_URL=%1
)

echo Using API URL: %API_URL%
echo.

REM Test 1: Get all onboarding sections
echo Test 1: GET /onboarding/sections
echo ----------------------------------------
curl -s "%API_URL%/onboarding/sections"
echo.
echo.

REM Test 2: Get tool-sop sections
echo Test 2: GET /onboarding/sections?category=tool-sop
echo ----------------------------------------
curl -s "%API_URL%/onboarding/sections?category=tool-sop"
echo.
echo.

REM Test 3: Get general-sop sections
echo Test 3: GET /onboarding/sections?category=general-sop
echo ----------------------------------------
curl -s "%API_URL%/onboarding/sections?category=general-sop"
echo.
echo.

REM Test 4: Check API health
echo Test 4: GET /health
echo ----------------------------------------
curl -s "%API_URL%/health"
echo.
echo.

echo ========================================
echo Tests Complete
echo ========================================
echo If you see JSON data above, the API is working!
echo If you see errors, check:
echo   1. Is your API server running?
echo   2. Is the URL correct?
echo   3. Did you run the SQL migration in Supabase?
echo.
pause

@echo off
setlocal
cd /d "%~dp0\.."
set "PLC_APP_ROOT=%CD%"
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run pack:win
endlocal

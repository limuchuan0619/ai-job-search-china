@echo off
setlocal
set "AI_CAREER_SCRIPT=%~dp0Start-AI-Career-Agent.ps1"
set "AI_CAREER_HOME=%~dp0"

if not exist "%AI_CAREER_SCRIPT%" (
  echo.
  echo AI Career Agent launcher script was not found:
  echo %AI_CAREER_SCRIPT%
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$s = [IO.File]::ReadAllText($env:AI_CAREER_SCRIPT, [Text.Encoding]::UTF8); & ([ScriptBlock]::Create($s)) %*"
set "AI_CAREER_EXIT=%ERRORLEVEL%"

if not "%AI_CAREER_EXIT%"=="0" (
  echo.
  echo AI Career Agent stopped with exit code %AI_CAREER_EXIT%.
  echo Keep the message above when asking for help.
  echo.
  pause
)

exit /b %AI_CAREER_EXIT%

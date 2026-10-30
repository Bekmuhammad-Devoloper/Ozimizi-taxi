@echo off
rem MOVIY TAXI - production deploy from PowerShell / cmd.
rem   deploy\deploy.cmd          web apps + backend
rem   deploy\deploy.cmd apk      + rebuild and publish both Android APKs
setlocal
set "D=%~dp0"
set "D=%D:\=/%"
set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%BASH%" echo Git Bash topilmadi. Git for Windows ornating: https://git-scm.com/download/win
if not exist "%BASH%" exit /b 1
"%BASH%" -lc "bash '%D%deploy.sh' %*"
exit /b %ERRORLEVEL%
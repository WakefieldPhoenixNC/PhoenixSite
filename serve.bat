@echo off
rem Double-click to preview the site at http://localhost:8080
rem and test the CMS at http://localhost:8080/admin/ (no login needed locally).
rem Everything runs from this file's own folder, wherever it's launched from.
cd /d "%~dp0"

rem Both servers only listen to this computer ("localhost"). Otherwise anyone
rem on the same Wi-Fi could browse this folder, and the CMS server would even
rem let them change files in it. It has to be "localhost", not 127.0.0.1: the
rem browser tries localhost's IPv6 address first, and with 127.0.0.1 every
rem file waited 0.3s for that to fail, which made each page load in stages.
set BIND_HOST=localhost

rem Builds the site exactly as Netlify publishes it (see build.js), then
rem previews that. After changing anything, in the local CMS or in the code,
rem close this window and double-click again to see the change.
node build.js || (pause & exit /b 1)

rem The local CMS server opens in its own window. Close that window to stop it.
start "Decap CMS local server" cmd /k npx.cmd --yes decap-server

start "" http://localhost:8080/index.html
python -m http.server 8080 --bind localhost --directory _site

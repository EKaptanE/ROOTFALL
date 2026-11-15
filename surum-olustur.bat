@echo off
rem Builds the ROOTFALL installer and opens the folder that contains it.
cd /d "%~dp0"
echo ROOTFALL kurulum dosyasi olusturuluyor, birkac dakika surebilir...
echo.
call npm run tauri build
if errorlevel 1 (
  echo.
  echo HATA: Derleme basarisiz oldu. Yukaridaki ciktiyi kopyalayip Claude'a yapistir.
  pause
  exit /b 1
)
echo.
echo Bitti. Kurulum dosyasi acilan klasorde.
start "" "%~dp0src-tauri\target\release\bundle\nsis"
pause

@echo off
rem ============================================================
rem Delta Force - Android APK build (no Gradle) - WebView wrapper
rem Requires: JDK 17 + Android SDK (build-tools 34.0.0 / android-34) + 7-Zip
rem Output: android\DeltaForce.apk
rem Sign: keystore at android\release.keystore; passwords from env
rem   KEYSTORE_PASS / KEY_PASS (prompted if unset). Keystore gitignored.
rem ============================================================
setlocal
set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "BT=%SDK%\build-tools\34.0.0"
set "PLAT=%SDK%\platforms\android-34\android.jar"
set "SZ=C:\Program Files\7-Zip\7z.exe"
set "ROOT=%~dp0"
set "WORK=%TEMP%\dfd_apk_build"
set "OUT=%WORK%\build"

if not exist "%BT%\aapt2.exe" ( echo [ERR] build-tools not found: %BT% & exit /b 1 )
if not exist "%PLAT%" ( echo [ERR] platform not found: %PLAT% & exit /b 1 )
if not exist "%SZ%" ( echo [ERR] 7-Zip not found: %SZ% & exit /b 1 )

if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%" || goto :err
mkdir "%OUT%\gen" "%OUT%\classes" "%OUT%\dex" 2>nul
xcopy /E /I /Y /Q "%ROOT%res" "%WORK%\res" >nul || goto :err
xcopy /E /I /Y /Q "%ROOT%java" "%WORK%\java" >nul || goto :err
copy /Y "%ROOT%AndroidManifest.xml" "%WORK%\AndroidManifest.xml" >nul || goto :err
set "ROOT=%WORK%\"

echo [1/6] compile resources...
"%BT%\aapt2.exe" compile --dir "%ROOT%res" -o "%OUT%\res.zip" || goto :err

echo [2/6] link manifest + resources...
"%BT%\aapt2.exe" link -o "%OUT%\unsigned.apk" -I "%PLAT%" ^
  --manifest "%ROOT%AndroidManifest.xml" -R "%OUT%\res.zip" --auto-add-overlay ^
  --java "%OUT%\gen" --min-sdk-version 24 --target-sdk-version 34 ^
  --version-code 2 --version-name 3.0 || goto :err

echo [3/6] compile java...
javac -encoding UTF-8 -source 1.8 -target 1.8 -classpath "%PLAT%" -d "%OUT%\classes" ^
  "%OUT%\gen\com\deltadf\price\R.java" "%ROOT%java\com\deltadf\price\MainActivity.java" || goto :err

echo [4/6] dex...
jar cf "%OUT%\classes.jar" -C "%OUT%\classes" . || goto :err
call "%BT%\d8.bat" --release --lib "%PLAT%" --output "%OUT%\dex" "%OUT%\classes.jar" || goto :err

echo [5/6] add classes.dex via 7-Zip (resources.arsc stays STORED)...
pushd "%OUT%\dex"
"%SZ%" a -tzip "%OUT%\unsigned.apk" classes.dex -mx5 || goto :err
popd
"%BT%\zipalign.exe" -f 4 "%OUT%\unsigned.apk" "%OUT%\aligned.apk" || goto :err

echo [6/6] sign...
rem Passwords must NOT be hardcoded: read from gitignored root .env (KEYSTORE_PASS / KEY_PASS), then env, then prompt.
if "%KEYSTORE_PASS%"=="" for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0..\.env") do (
  if /i "%%a"=="KEYSTORE_PASS" set "KEYSTORE_PASS=%%b"
)
if "%KEY_PASS%"=="" for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0..\.env") do (
  if /i "%%a"=="KEY_PASS" set "KEY_PASS=%%b"
)
if "%KEYSTORE_PASS%"=="" set /p KEYSTORE_PASS=Keystore pass (KEYSTORE_PASS):
if "%KEY_PASS%"=="" set /p KEY_PASS=Key pass (KEY_PASS):
if not exist "%~dp0release.keystore" (
  keytool -genkeypair -keystore "%~dp0release.keystore" -alias dfd -keyalg RSA -keysize 2048 ^
    -validity 10000 -storepass "%KEYSTORE_PASS%" -keypass "%KEY_PASS%" -dname "CN=DFD, OU=DFD, O=DFD, L=CN, S=CN, C=CN" -noprompt
)
call "%BT%\apksigner.bat" sign --ks "%~dp0release.keystore" --ks-pass pass:%KEYSTORE_PASS% ^
  --key-pass pass:%KEY_PASS% --v1-signing-enabled false --out "%OUT%\DeltaForce.apk" "%OUT%\aligned.apk" || goto :err

copy /Y "%OUT%\DeltaForce.apk" "%~dp0DeltaForce.apk" >nul || goto :err
echo.
echo [DONE] %~dp0DeltaForce.apk
exit /b 0

:err
echo [ERR] build failed
exit /b 1

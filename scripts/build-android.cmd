@echo off
setlocal
rem Builds an installable Android APK on Windows.
rem
rem   Usage (from the project folder):  scripts\build-android.cmd
rem   Output: <BUILD_DIR>\android\app\build\outputs\apk\release\app-release.apk
rem
rem Android's native build fails when the project path contains spaces, so this copies the project
rem to BUILD_DIR (default C:\platewise-build, a build-only copy you can delete any time) and builds
rem there. Optional settings, set them before running:
rem   BUILD_DIR     another folder without spaces
rem   ABIS          CPU types to build for (default arm64-v8a,x86_64; add armeabi-v7a for old 32-bit phones)
rem   ANDROID_HOME  Android SDK location (default: where Android Studio installs it)
rem   JAVA_HOME     a JDK 17 (default: Temurin 17, then Android Studio's bundled JDK)

set "SRC=%~dp0.."
for %%I in ("%SRC%") do set "SRC=%%~fI"
if not defined BUILD_DIR set "BUILD_DIR=C:\platewise-build"
if not defined ABIS set "ABIS=arm64-v8a,x86_64"

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
  echo Android SDK not found at "%ANDROID_HOME%".
  echo Install Android Studio, open SDK Manager once, or set ANDROID_HOME to your SDK folder.
  exit /b 1
)

if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" set "JAVA_HOME="
if not defined JAVA_HOME for /d %%J in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*") do set "JAVA_HOME=%%~fJ"
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME (
  echo No JDK found. Install JDK 17 from https://adoptium.net or set JAVA_HOME.
  exit /b 1
)

if not exist "%SRC%\node_modules" (
  echo Run "npm install" in the project folder first.
  exit /b 1
)

echo Project:  %SRC%
echo Building: %BUILD_DIR%
echo SDK:      %ANDROID_HOME%
echo JDK:      %JAVA_HOME%

rem The android folder is generated from app.json (it isn't in git), so it's excluded here and
rem regenerated below. node_modules is copied without purging, so the native libraries Gradle
rem compiled last time stay and rebuilds take a minute or two. After removing a package, delete
rem %BUILD_DIR%\node_modules once.
robocopy "%SRC%" "%BUILD_DIR%" /MIR /XD "%SRC%\node_modules" "%SRC%\android" "%SRC%\ios" "%SRC%\.expo" "%SRC%\.git" /NFL /NDL /NJH /NJS /NP /MT:16 > nul
robocopy "%SRC%\node_modules" "%BUILD_DIR%\node_modules" /E /NFL /NDL /NJH /NJS /NP /MT:16 > nul

cd /d "%BUILD_DIR%"
set NODE_ENV=production
set EXPO_NO_GIT_STATUS=1
call npx expo prebuild --platform android --no-install
if errorlevel 1 (
  echo Generating the android folder failed.
  exit /b 1
)

echo sdk.dir=%ANDROID_HOME:\=/%> android\local.properties
rem Full path: some shells set NoDefaultCurrentDirectoryInExePath, so cmd won't look in the current folder.
call "%BUILD_DIR%\android\gradlew.bat" -p "%BUILD_DIR%\android" assembleRelease --init-script "%BUILD_DIR%\scripts\no-lint.gradle" "-PreactNativeArchitectures=%ABIS%" "-Pexpo.useLegacyPackaging=true" --console=plain
if errorlevel 1 (
  echo Build failed. See the error above.
  exit /b 1
)

echo.
echo Done. APK: %BUILD_DIR%\android\app\build\outputs\apk\release\app-release.apk

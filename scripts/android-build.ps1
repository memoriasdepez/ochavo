param([ValidateSet('Debug','Bundle')][string]$Target='Debug')
$ErrorActionPreference='Stop'
if($Target -eq 'Bundle'){
    & (Join-Path $PSScriptRoot 'android-release.ps1')
    exit $LASTEXITCODE
}
$broteRoot=Split-Path -Parent $PSScriptRoot
$broteWorkspace=Split-Path -Parent (Split-Path -Parent $broteRoot)
$broteWork=Join-Path $broteWorkspace 'work'

# Prefer an existing toolchain. The portable tools are kept outside the app source.
if(-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin/javac.exe'))){
    $broteJdk=Get-ChildItem (Join-Path $broteWork 'android-java') -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if(-not $broteJdk){throw 'Hace falta Java JDK 21: configura JAVA_HOME o instala Android Studio.'}
    $env:JAVA_HOME=$broteJdk.FullName
}
if(-not $env:ANDROID_HOME){
    if($env:ANDROID_SDK_ROOT){$env:ANDROID_HOME=$env:ANDROID_SDK_ROOT}
    elseif(Test-Path (Join-Path $broteWork 'android-sdk')){$env:ANDROID_HOME=Join-Path $broteWork 'android-sdk'}
    elseif(Test-Path (Join-Path $env:LOCALAPPDATA 'Android/Sdk')){$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android/Sdk'}
}
if(-not $env:ANDROID_HOME -or -not (Test-Path (Join-Path $env:ANDROID_HOME 'platforms/android-36/android.jar'))){
    throw 'Instala Android SDK Platform 36 y Build Tools 36.0.0 y configura ANDROID_HOME.'
}
if(-not $env:GRADLE_USER_HOME){$env:GRADLE_USER_HOME=Join-Path $broteWork 'gradle'}
if(-not $env:ANDROID_USER_HOME){$env:ANDROID_USER_HOME=Join-Path $broteWork 'android-user'}
$env:VITE_USE_EMULATORS='false'

Push-Location $broteRoot
try{
    if(-not (Test-Path 'node_modules/@capacitor/cli/bin/capacitor')){throw 'Primero ejecuta pnpm install --frozen-lockfile.'}
    & node scripts/build-technical-curriculum.mjs
    if($LASTEXITCODE -ne 0){throw 'No se pudo preparar Análisis técnico.'}
    & node scripts/build-course.mjs
    if($LASTEXITCODE -ne 0){throw 'No se pudo preparar el contenido de los cuatro caminos.'}
    & node scripts/build-game-catalog.mjs
    if($LASTEXITCODE -ne 0){throw 'No se pudo preparar el catálogo de recompensas.'}
    & node scripts/build-public-pages.mjs
    if($LASTEXITCODE -ne 0){throw 'No se pudieron preparar las paginas de ayuda y privacidad.'}
    & node node_modules/vite/bin/vite.js build
    if($LASTEXITCODE -ne 0){throw 'No se pudo construir la app web.'}
    & node scripts/ads-android-config.mjs
    if($LASTEXITCODE -ne 0){throw 'No se pudo preparar la configuración de publicidad Android.'}
    & node node_modules/@capacitor/cli/bin/capacitor sync android
    if($LASTEXITCODE -ne 0){throw 'No se pudo sincronizar el proyecto Android.'}
    Push-Location 'android'
    try{
        $broteTask=if($Target -eq 'Debug'){':app:assembleDebug'}else{':app:bundleRelease'}
        & .\gradlew.bat --no-daemon $broteTask ':app:lintDebug'
        if($LASTEXITCODE -ne 0){throw 'La compilación Android no terminó correctamente.'}
    }finally{Pop-Location}
    $broteOutput=Join-Path (Split-Path -Parent $broteRoot) 'ochavo-android'
    New-Item -ItemType Directory -Path $broteOutput -Force | Out-Null
    $broteVersion=(Get-Content 'package.json' -Raw | ConvertFrom-Json).version
    if($Target -eq 'Debug'){
        $broteDestination=Join-Path $broteOutput ('Ochavo-'+$broteVersion+'-pruebas.apk')
        Copy-Item -LiteralPath 'android/app/build/outputs/apk/debug/app-debug.apk' -Destination $broteDestination -Force
    }else{
        $broteDestination=Join-Path $broteOutput ('Ochavo-'+$broteVersion+'-sin-firmar.aab')
        Copy-Item -LiteralPath 'android/app/build/outputs/bundle/release/app-release.aab' -Destination $broteDestination -Force
        Write-Output 'El AAB necesita firma de publicación antes de enviarlo a Google Play.'
    }
    Get-FileHash -Algorithm SHA256 -LiteralPath $broteDestination | Format-List
}finally{Pop-Location}

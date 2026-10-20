param([ValidateRange(7,2100000000)][int]$VersionCode=71,[switch]$QaBaseline)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-signing.ps1')
$env:JAVA_HOME=$virutaJdk.FullName
$env:ANDROID_HOME=Join-Path $virutaWorkspace 'work/android-sdk'
$env:GRADLE_USER_HOME=Join-Path $virutaWorkspace 'work/gradle'
$env:ANDROID_USER_HOME=Join-Path $virutaWorkspace 'work/android-user'
$env:VITE_USE_EMULATORS='false'
$virutaVersion=(Get-Content -LiteralPath (Join-Path $virutaApp 'package.json') -Raw | ConvertFrom-Json).version
$virutaOutput=if($QaBaseline){Join-Path $virutaWorkspace 'work/beta-baseline'}else{Join-Path $virutaWorkspace 'outputs/ochavo-beta'}
New-Item -ItemType Directory -Path $virutaOutput -Force | Out-Null
Push-Location $virutaApp
try{
    if(-not (Select-String -LiteralPath '.env.local' -Pattern '^VITE_FIREBASE_PROJECT_ID=brote-62d26$' -Quiet)){throw 'Revisar el proyecto Firebase de publicacion.'}
    foreach($virutaScript in @('scripts/build-stocks-curriculum.mjs','scripts/build-stocks-variety.mjs','scripts/build-etfs-curriculum.mjs','scripts/build-etfs-variety.mjs','scripts/build-crypto-curriculum.mjs','scripts/build-crypto-variety.mjs','scripts/build-technical-curriculum.mjs','scripts/build-cases.mjs','scripts/build-course.mjs','scripts/build-game-catalog.mjs','scripts/build-public-pages.mjs')){
        & node $virutaScript
        if($LASTEXITCODE -ne 0){throw 'Error al preparar el contenido.'}
    }
    & node scripts/build-release.mjs
    if($LASTEXITCODE -ne 0){throw 'Error al compilar la app web.'}
    & node scripts/ads-android-config.mjs
    if($LASTEXITCODE -ne 0){throw 'Error al preparar la publicidad Android.'}
    & node node_modules/@capacitor/cli/bin/capacitor sync android
    if($LASTEXITCODE -ne 0){throw 'Error al preparar Android.'}
    Push-Location android
    try{
        Set-VirutaSigningEnvironment app
        & .\gradlew.bat --no-daemon ('-PvirutaVersionCode='+$VersionCode) :app:assembleRelease :app:lintRelease
        if($LASTEXITCODE -ne 0){throw 'Fallo de compilacion o revision Android.'}
        $virutaApk=Join-Path $virutaOutput ('Ochavo-'+$virutaVersion+'-beta.apk')
        Copy-Item -LiteralPath app/build/outputs/apk/release/app-release.apk -Destination $virutaApk -Force
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $ochavoSoundArchive = [IO.Compression.ZipFile]::OpenRead($virutaApk)
        try {
            foreach ($ochavoSound in @('correct','chest','badge')) {
                $ochavoSoundEntry = $ochavoSoundArchive.GetEntry('assets/public/sounds/' + $ochavoSound + '.wav')
                if (-not $ochavoSoundEntry -or $ochavoSoundEntry.Length -lt 44 -or $ochavoSoundEntry.CompressedLength -ne $ochavoSoundEntry.Length) {
                    throw ('El sonido Android debe estar presente y sin comprimir: ' + $ochavoSound)
                }
            }
        } finally { $ochavoSoundArchive.Dispose() }
        & (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat') verify --verbose --print-certs $virutaApk
        if($LASTEXITCODE -ne 0){throw 'Firma APK no valida.'}
        if(-not $QaBaseline){
            $virutaPlay=Join-Path $virutaOutput 'google-play'
            New-Item -ItemType Directory -Path $virutaPlay -Force | Out-Null
            & $virutaKeytool -exportcert -rfc -keystore $env:VIRUTA_KEYSTORE -storepass:env VIRUTA_STORE_PASSWORD -alias $env:VIRUTA_KEY_ALIAS -file (Join-Path $virutaPlay 'app-certificate.pem')
            if($LASTEXITCODE -ne 0){throw 'Error al exportar el certificado publico.'}
            Set-VirutaSigningEnvironment upload
            & .\gradlew.bat --no-daemon ('-PvirutaVersionCode='+$VersionCode) :app:bundleRelease
            if($LASTEXITCODE -ne 0){throw 'Error al crear el AAB.'}
            $virutaAab=Join-Path $virutaPlay ('Ochavo-'+$virutaVersion+'-beta.aab')
            Copy-Item -LiteralPath app/build/outputs/bundle/release/app-release.aab -Destination $virutaAab -Force
            & (Join-Path $env:JAVA_HOME 'bin/jarsigner.exe') -verify -strict -keystore $env:VIRUTA_KEYSTORE -storepass:env VIRUTA_STORE_PASSWORD $virutaAab $env:VIRUTA_KEY_ALIAS
            if($LASTEXITCODE -ne 0){throw 'Firma AAB no valida.'}
            & $virutaKeytool -exportcert -rfc -keystore $env:VIRUTA_KEYSTORE -storepass:env VIRUTA_STORE_PASSWORD -alias $env:VIRUTA_KEY_ALIAS -file (Join-Path $virutaPlay 'upload-certificate.pem')
            if($LASTEXITCODE -ne 0){throw 'Error al exportar el certificado publico.'}
        }
    }finally{Clear-VirutaSigningEnvironment;Pop-Location}
    Get-FileHash -Algorithm SHA256 -LiteralPath $virutaApk | Format-List
}finally{Clear-VirutaSigningEnvironment;Pop-Location}

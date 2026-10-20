param([switch]$Initialize)
$ErrorActionPreference='Stop'
$virutaApp=Split-Path -Parent $PSScriptRoot
$virutaWorkspace=Split-Path -Parent (Split-Path -Parent $virutaApp)
$virutaPrivate=Join-Path $virutaApp '.signing'
$virutaJdk=Get-ChildItem (Join-Path $virutaWorkspace 'work/android-java') -Directory -Filter 'jdk-*' | Select-Object -First 1
if(-not $virutaJdk){throw 'No se encuentra JDK 21.'}
$virutaKeytool=Join-Path $virutaJdk.FullName 'bin/keytool.exe'
if($Initialize){
    if([System.Security.Principal.WindowsIdentity]::GetCurrent().Name -match 'CodexSandbox'){throw 'Ejecutar con el usuario propietario de Windows: DPAPI necesita su perfil.'}
    New-Item -ItemType Directory -Path $virutaPrivate -Force | Out-Null
    # Preserve the existing folder permissions. Windows DPAPI protects passwords;
    # PKCS12 files are additionally encrypted with independent random passwords.
    foreach($virutaPurpose in @('app','upload')){
        $virutaStore=Join-Path $virutaPrivate ($virutaPurpose+'.p12')
        $virutaPasswordFile=Join-Path $virutaPrivate ($virutaPurpose+'.dpapi')
        if((Test-Path $virutaStore) -or (Test-Path $virutaPasswordFile)){
            if(-not ((Test-Path $virutaStore) -and (Test-Path $virutaPasswordFile))){throw 'Firma incompleta: recuperar la copia, nunca reemplazar una clave existente.'}
            $virutaExisting=(Get-Content -LiteralPath $virutaPasswordFile -Raw).Trim() | ConvertTo-SecureString
            $virutaPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($virutaExisting)
            try{$env:VIRUTA_NEW_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($virutaPointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($virutaPointer)}
            try{
                & $virutaKeytool -list -keystore $virutaStore -storetype PKCS12 -storepass:env VIRUTA_NEW_PASSWORD -alias ('viruta-'+$virutaPurpose) | Out-Null
                if($LASTEXITCODE -ne 0){throw 'Firma existente no valida. Recuperar la copia; no se ha reemplazado.'}
            }finally{Remove-Item Env:VIRUTA_NEW_PASSWORD -ErrorAction SilentlyContinue}
            continue
        }
        $virutaRandom=New-Object byte[] 48
        $virutaRng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
        try{$virutaRng.GetBytes($virutaRandom)}finally{$virutaRng.Dispose()}
        $env:VIRUTA_NEW_PASSWORD=[Convert]::ToBase64String($virutaRandom)
        try{
            ConvertTo-SecureString $env:VIRUTA_NEW_PASSWORD -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $virutaPasswordFile -Encoding ascii
            & $virutaKeytool -genkeypair -keystore $virutaStore -storetype PKCS12 -storepass:env VIRUTA_NEW_PASSWORD -keypass:env VIRUTA_NEW_PASSWORD -alias ('viruta-'+$virutaPurpose) -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10950 -dname 'CN=Viruta, O=MEMORIAS MEDIA SL, L=Melilla, C=ES' -noprompt
            if($LASTEXITCODE -ne 0){throw 'No se pudo generar la firma; conservar los archivos para diagnosticarla.'}
        }finally{Remove-Item Env:VIRUTA_NEW_PASSWORD -ErrorAction SilentlyContinue}
    }
    Write-Output 'Firmas de aplicacion y subida listas. Las contrasenas estan protegidas para este usuario de Windows.'
}

function Set-VirutaSigningEnvironment([ValidateSet('app','upload')][string]$Purpose){
    $virutaStore=Join-Path $virutaPrivate ($Purpose+'.p12')
    $virutaPasswordFile=Join-Path $virutaPrivate ($Purpose+'.dpapi')
    if(-not ((Test-Path $virutaStore) -and (Test-Path $virutaPasswordFile))){throw 'Falta la firma. Inicializar solo para una app nueva o restaurar su copia existente.'}
    $virutaSecure=(Get-Content -LiteralPath $virutaPasswordFile -Raw).Trim() | ConvertTo-SecureString
    $virutaPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($virutaSecure)
    try{$env:VIRUTA_STORE_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($virutaPointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($virutaPointer)}
    $env:VIRUTA_KEYSTORE=$virutaStore
    $env:VIRUTA_KEY_ALIAS='viruta-'+$Purpose
    & $virutaKeytool -list -keystore $virutaStore -storetype PKCS12 -storepass:env VIRUTA_STORE_PASSWORD -alias $env:VIRUTA_KEY_ALIAS | Out-Null
    if($LASTEXITCODE -ne 0){throw 'La clave guardada no es valida. No se ha regenerado.'}
}

function Clear-VirutaSigningEnvironment {
    foreach($virutaName in @('VIRUTA_STORE_PASSWORD','VIRUTA_KEYSTORE','VIRUTA_KEY_ALIAS')){
        Remove-Item -LiteralPath ('Env:'+ $virutaName) -ErrorAction SilentlyContinue
    }
}

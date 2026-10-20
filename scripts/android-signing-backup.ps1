param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-signing.ps1')
if(Test-Path -LiteralPath $Destination){throw 'Usa una carpeta nueva y privada, preferiblemente en una unidad externa.'}
$virutaBackupPassword=Read-Host 'Contrasena para la copia privada (minimo 16 caracteres; guardala en tu gestor de contrasenas)' -AsSecureString
$virutaPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($virutaBackupPassword)
try{$env:VIRUTA_BACKUP_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($virutaPointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($virutaPointer)}
try{
    if($env:VIRUTA_BACKUP_PASSWORD.Length -lt 16){throw 'La contrasena debe tener al menos 16 caracteres.'}
    New-Item -ItemType Directory -Path $Destination | Out-Null
    foreach($virutaPurpose in @('app','upload')){
        Set-VirutaSigningEnvironment $virutaPurpose
        $virutaBackupStore=Join-Path $Destination ($virutaPurpose+'.p12')
        & $virutaKeytool -importkeystore -srckeystore $env:VIRUTA_KEYSTORE -srcstoretype PKCS12 -srcstorepass:env VIRUTA_STORE_PASSWORD -srcalias $env:VIRUTA_KEY_ALIAS -destkeystore $virutaBackupStore -deststoretype PKCS12 -deststorepass:env VIRUTA_BACKUP_PASSWORD -destkeypass:env VIRUTA_BACKUP_PASSWORD -destalias $env:VIRUTA_KEY_ALIAS -noprompt
        if($LASTEXITCODE -ne 0){throw 'La copia no se completo. No borres las claves originales.'}
        & $virutaKeytool -list -keystore $virutaBackupStore -storepass:env VIRUTA_BACKUP_PASSWORD -alias $env:VIRUTA_KEY_ALIAS | Out-Null
        if($LASTEXITCODE -ne 0){throw 'La copia no supera la verificacion.'}
    }
    'COPIA PRIVADA DE FIRMA OCHAVO. Nunca compartir con testers ni subir al repositorio. Conservar ambos PKCS12 y su contrasena en lugares separados. Se mantienen los alias historicos viruta-app y viruta-upload para actualizar la app existente: app.brote.inversion.' | Set-Content (Join-Path $Destination 'LEEME-PRIVADO.txt') -Encoding UTF8
    Write-Output 'Copia protegida verificada. Guarda la contrasena fuera de esta carpeta. Conserva tambien el ordenador original hasta comprobar la restauracion.'
}finally{
    Clear-VirutaSigningEnvironment
    Remove-Item Env:VIRUTA_BACKUP_PASSWORD -ErrorAction SilentlyContinue
}

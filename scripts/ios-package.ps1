$ErrorActionPreference = 'Stop'
$virutaApp = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$virutaOutput = [IO.Path]::GetFullPath((Join-Path $virutaApp '../ochavo-ios'))
$virutaDocs = Join-Path $virutaApp 'docs/ios'
$virutaVersion = (Get-Content -LiteralPath (Join-Path $virutaApp 'package.json') -Raw | ConvertFrom-Json).version
$virutaName = 'Ochavo-iOS-' + $virutaVersion
$virutaStage = [IO.Path]::GetFullPath((Join-Path $virutaOutput $virutaName))
if (-not $virutaStage.StartsWith($virutaOutput + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino fuera del directorio de entrega.' }
if (Test-Path -LiteralPath $virutaStage) { Remove-Item -LiteralPath $virutaStage -Recurse -Force }
New-Item -ItemType Directory -Path $virutaStage -Force | Out-Null

function Copy-VirutaFile([string]$Relative) {
    $source = [IO.Path]::GetFullPath((Join-Path $virutaApp $Relative))
    if (-not $source.StartsWith($virutaApp + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Origen fuera de la app.' }
    $target = Join-Path $virutaStage $Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
}

# Positive allowlist. Never copy the whole workspace or the environment file.
foreach ($file in @('index.html','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','vite.config.js','capacitor.config.json','.env.example','AGENTS.md')) { Copy-VirutaFile $file }
foreach ($file in @('course-authoring.mjs','dictionary-authoring.mjs','build-stocks-curriculum.mjs','build-stocks-variety.mjs','build-etfs-curriculum.mjs','build-etfs-variety.mjs','build-crypto-curriculum.mjs','build-crypto-variety.mjs','build-technical-curriculum.mjs','build-cases.mjs','build-course.mjs','build-game-catalog.mjs','build-public-pages.mjs','build-release.mjs','release-config.mjs','ios-sync.mjs','ios-check.mjs','ios-icon-render.mjs','render-brand-assets.mjs','build-feedback-sounds.mjs')) { Copy-VirutaFile ('scripts/' + $file) }
foreach ($folder in @('src','public','ios','cuenta','scripts/technical-authoring','scripts/stocks-editorial','scripts/funds-crypto-editorial','scripts/cases-authoring','assets/brand')) {
    Get-ChildItem -LiteralPath (Join-Path $virutaApp $folder) -File -Recurse | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($virutaApp, $_.FullName).Replace('\','/')
        if ($relative -match '(^|/)(\.browser-temp|build|Pods|DerivedData|xcuserdata|output|\.git|node_modules)(/|$)') { return }
        if ($_.Name.StartsWith('.') -or $_.Extension -in @('.log','.jks','.keystore','.p12','.p8','.mobileprovision')) { return }
        if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('Enlace no autorizado: ' + $relative) }
        Copy-VirutaFile $relative
    }
}

$virutaEnv = @{}
Get-Content -LiteralPath (Join-Path $virutaApp '.env.local') | ForEach-Object {
    if ($_ -match '^(VITE_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID|STORAGE_BUCKET|MESSAGING_SENDER_ID|MEASUREMENT_ID))=(.*)$') { $virutaEnv[$matches[1]] = $matches[3] }
}
foreach ($key in @('VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID')) { if (-not $virutaEnv[$key]) { throw ('Falta configuración pública: ' + $key) } }
if ($virutaEnv['VITE_FIREBASE_PROJECT_ID'] -ne 'brote-62d26') { throw 'Proyecto público inesperado.' }
$virutaPublicEnv = @('# Configuración pública del cliente; no contiene credenciales administrativas.') + @($virutaEnv.Keys | Sort-Object | ForEach-Object { $_ + '=' + $virutaEnv[$_] }) + @('VITE_USE_EMULATORS=false')
[IO.File]::WriteAllLines((Join-Path $virutaStage 'configuracion-firebase-publica.env'), $virutaPublicEnv, [Text.UTF8Encoding]::new($false))
foreach ($file in @('LEEME-IPHONE.txt','PREPARAR-EN-MAC.txt','PRIVACIDAD-Y-PRUEBAS-IOS.txt','AUDITORIA-PENDIENTES.txt',('NOVEDADES-'+$virutaVersion+'.txt'))) { Copy-Item -LiteralPath (Join-Path $virutaDocs $file) -Destination (Join-Path $virutaStage $file) }

$virutaInventory = @(Get-ChildItem -LiteralPath $virutaStage -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($virutaStage, $_.FullName).Replace('\','/')
    if ($relative -match '(^|/)(android|node_modules|\.signing|\.firebase|tests|work|\.env\.local)(/|$)' -or $relative -match '(?i)service.?account|private.?key|credential|qa-private') { throw ('Archivo prohibido: ' + $relative) }
    [ordered]@{path=$relative;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$virutaList = [ordered]@{createdAt=[DateTime]::UtcNow.ToString('o');app='Ochavo';version=$virutaVersion;nativeBuildVerified=$false;files=$virutaInventory}
$virutaInventoryJson = $virutaList | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $virutaStage 'LISTA-ARCHIVOS.json'), $virutaInventoryJson, [Text.UTF8Encoding]::new($false))
$virutaZip = Join-Path $virutaOutput ($virutaName + '-para-Mac.zip')
Compress-Archive -LiteralPath $virutaStage -DestinationPath $virutaZip -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($virutaZip)
try {
    $entries = @($archive.Entries | Where-Object { $_.Name })
    if ($entries.Count -ne $virutaInventory.Count + 1) { throw 'El ZIP no coincide con el inventario.' }
    foreach ($item in $virutaInventory) {
        $entry = $archive.GetEntry($virutaName + '/' + $item.path)
        if (-not $entry -or $entry.Length -ne $item.bytes) { throw ('Falta recurso en ZIP: ' + $item.path) }
        $stream=$entry.Open(); $sha=[Security.Cryptography.SHA256]::Create()
        try { $hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose();$stream.Dispose() }
        if ($hash -ne $item.sha256) { throw ('Hash distinto: ' + $item.path) }
    }
} finally { $archive.Dispose() }
$check = [ordered]@{zip=(Split-Path -Leaf $virutaZip);bytes=(Get-Item -LiteralPath $virutaZip).Length;sha256=(Get-FileHash -LiteralPath $virutaZip -Algorithm SHA256).Hash.ToLowerInvariant();verifiedFiles=$virutaInventory.Count;excluded=@('android','node_modules','.signing','.firebase','.env.local','credentials','test/QA data');includedPublicFirebaseConfigKeys=@($virutaEnv.Keys | Sort-Object) + @('VITE_USE_EMULATORS');nativeBuildVerified=$false}
$check | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $virutaOutput 'VERIFICACION-PAQUETE.json') -Encoding utf8
[pscustomobject]$check | Select-Object zip,bytes,verifiedFiles,sha256 | Format-List

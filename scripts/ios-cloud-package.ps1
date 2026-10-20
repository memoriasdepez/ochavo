$ErrorActionPreference = 'Stop'
$ochavoApp = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ochavoOutput = [IO.Path]::GetFullPath((Join-Path $ochavoApp '../ochavo-ios'))
$ochavoVersion = (Get-Content -LiteralPath (Join-Path $ochavoApp 'package.json') -Raw | ConvertFrom-Json).version
$ochavoOriginal = Join-Path $ochavoOutput ('Ochavo-iOS-' + $ochavoVersion)
$ochavoName = 'Ochavo-iOS-' + $ochavoVersion + '-nube'
$ochavoStage = [IO.Path]::GetFullPath((Join-Path $ochavoOutput $ochavoName))
if (-not $ochavoStage.StartsWith($ochavoOutput + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino fuera de la entrega iOS.' }
$ochavoOriginalList = Get-Content -LiteralPath (Join-Path $ochavoOriginal 'LISTA-ARCHIVOS.json') -Raw | ConvertFrom-Json
if ($ochavoOriginalList.version -ne $ochavoVersion) { throw 'Regenerar primero el paquete iOS de esta versión.' }

# Reuse the verified positive allowlist, never the full workspace.
foreach ($item in $ochavoOriginalList.files) {
    $source = [IO.Path]::GetFullPath((Join-Path $ochavoOriginal $item.path))
    if (-not $source.StartsWith($ochavoOriginal + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Origen fuera del paquete.' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw ('Paquete original modificado: ' + $item.path) }
}
if (Test-Path -LiteralPath $ochavoStage) { Remove-Item -LiteralPath $ochavoStage -Recurse -Force }
New-Item -ItemType Directory -Path $ochavoStage -Force | Out-Null
foreach ($item in $ochavoOriginalList.files) {
    $target = [IO.Path]::GetFullPath((Join-Path $ochavoStage $item.path))
    if (-not $target.StartsWith($ochavoStage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino fuera del paquete.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $ochavoOriginal $item.path) -Destination $target
}
foreach ($relative in @('codemagic.yaml','scripts/ios-cloud-version.mjs','ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme')) {
    $target = Join-Path $ochavoStage $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $ochavoApp $relative) -Destination $target
}
Copy-Item -LiteralPath (Join-Path $ochavoOutput 'PUBLICAR-SIN-MAC.txt') -Destination (Join-Path $ochavoStage 'PUBLICAR-SIN-MAC.txt')
[IO.File]::WriteAllText((Join-Path $ochavoStage '.gitignore'), "node_modules/`ndist/`n.env.local`n.env.*.local`nbuild/`nDerivedData/`n**/xcuserdata/`n*.p8`n*.p12`n*.mobileprovision`n*.ipa`n", [Text.UTF8Encoding]::new($false))

$ochavoFiles = @(Get-ChildItem -LiteralPath $ochavoStage -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($ochavoStage, $_.FullName).Replace('\','/')
    if ($relative -match '(^|/)(node_modules|android|\.signing|\.firebase|work|tests|\.env\.local)(/|$)' -or $relative -match '(?i)service.?account|private.?key|credential|qa-private|\.(p8|p12|mobileprovision|jks|keystore|dpapi)$') { throw ('Archivo prohibido: ' + $relative) }
    [ordered]@{path=$relative;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$ochavoInventory = [ordered]@{createdAt=[DateTime]::UtcNow.ToString('o');app='Ochavo';version=$ochavoVersion;nativeBuildVerified=$false;cloudBuildExecuted=$false;storeUpload=$false;files=$ochavoFiles}
[IO.File]::WriteAllText((Join-Path $ochavoStage 'LISTA-ARCHIVOS.json'), ($ochavoInventory | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$ochavoZip = Join-Path $ochavoOutput ($ochavoName + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $ochavoZip) { Remove-Item -LiteralPath $ochavoZip -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($ochavoStage, $ochavoZip, [IO.Compression.CompressionLevel]::Optimal, $true)
$ochavoArchive = [IO.Compression.ZipFile]::OpenRead($ochavoZip)
try {
    $entries = @($ochavoArchive.Entries | Where-Object { $_.Name })
    if ($entries.Count -ne $ochavoFiles.Count + 1) { throw 'El ZIP no coincide con el inventario.' }
    foreach ($item in $ochavoFiles) {
        $entry = $ochavoArchive.GetEntry($ochavoName + '/' + $item.path)
        if (-not $entry -or $entry.Length -ne $item.bytes) { throw ('Falta archivo: ' + $item.path) }
        $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose(); $stream.Dispose() }
        if ($hash -ne $item.sha256) { throw ('Hash distinto: ' + $item.path) }
    }
} finally { $ochavoArchive.Dispose() }
$ochavoCheck = [ordered]@{createdAt=[DateTime]::UtcNow.ToString('o');zip=(Split-Path -Leaf $ochavoZip);bytes=(Get-Item -LiteralPath $ochavoZip).Length;sha256=(Get-FileHash -LiteralPath $ochavoZip -Algorithm SHA256).Hash.ToLowerInvariant();verifiedFiles=$ochavoFiles.Count;nativeBuildVerified=$false;cloudBuildExecuted=$false;storeUpload=$false}
$ochavoCheck | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ochavoOutput 'VERIFICACION-NUBE.json') -Encoding utf8
[pscustomobject]$ochavoCheck | Format-List

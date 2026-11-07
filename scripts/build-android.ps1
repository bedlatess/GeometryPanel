param([switch]$SkipChecks)
$ErrorActionPreference = 'Stop'
$androidProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../android'))
$previousJava = $env:JAVA_HOME
$previousKeytoolPassword = $env:GEOMETRY_KEYTOOL_PASSWORD
try {
    if (!$SkipChecks) {
        & node (Join-Path $PSScriptRoot 'check-android.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Android back-handler checks failed.' }
    }
    $candidates = @($env:JAVA_HOME, 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot')
    $selectedJdk = $null
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $releaseFile = Join-Path $candidate 'release'
        if ((Test-Path -LiteralPath $releaseFile) -and ((Get-Content -LiteralPath $releaseFile -Raw) -match 'JAVA_VERSION="21\.')) {
            $selectedJdk = $candidate
            break
        }
    }
    if (!$selectedJdk) { throw 'Set JAVA_HOME to JDK 21.' }
    $env:JAVA_HOME = $selectedJdk
    $sdkDirectory = $env:ANDROID_HOME
    if ([string]::IsNullOrWhiteSpace($sdkDirectory)) { $sdkDirectory = $env:ANDROID_SDK_ROOT }
    if ([string]::IsNullOrWhiteSpace($sdkDirectory) -and (Test-Path -LiteralPath 'D:\Android\Sdk')) { $sdkDirectory = 'D:\Android\Sdk' }
    $localProperties = Join-Path $androidProject 'local.properties'
    if (!(Test-Path -LiteralPath $localProperties)) {
        if ([string]::IsNullOrWhiteSpace($sdkDirectory)) { throw 'Set ANDROID_HOME to the Android SDK directory.' }
        'sdk.dir=' + $sdkDirectory.Replace('\', '/').Replace(':', '\:') | Set-Content -LiteralPath $localProperties -Encoding ascii -NoNewline
    }
    if ([string]::IsNullOrWhiteSpace($env:GEOMETRY_KEYSTORE)) {
        $signingDirectory = Join-Path $androidProject '.signing'
        $signingProperties = Join-Path $signingDirectory 'signing.properties'
        $keyStoreFile = Join-Path $signingDirectory 'geometry-panel.jks'
        if (!(Test-Path -LiteralPath $signingProperties)) {
            if (Test-Path -LiteralPath $keyStoreFile) { throw 'Signing key exists without its properties. Restore the signing backup; do not replace the key.' }
            New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
            $random = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $passwordBytes = New-Object byte[] 32; $random.GetBytes($passwordBytes) } finally { $random.Dispose() }
            $env:GEOMETRY_KEYTOOL_PASSWORD = ([BitConverter]::ToString($passwordBytes)).Replace('-', '').ToLowerInvariant()
            & (Join-Path $selectedJdk 'bin/keytool.exe') -genkeypair -storetype PKCS12 -keystore $keyStoreFile -alias geometry-panel `
                -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=GeometryPanel, O=GeometryPanel' `
                -storepass:env GEOMETRY_KEYTOOL_PASSWORD -keypass:env GEOMETRY_KEYTOOL_PASSWORD -noprompt
            if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
            @('GEOMETRY_KEYSTORE=.signing/geometry-panel.jks', 'GEOMETRY_KEY_ALIAS=geometry-panel',
                "GEOMETRY_STORE_PASSWORD=$($env:GEOMETRY_KEYTOOL_PASSWORD)", "GEOMETRY_KEY_PASSWORD=$($env:GEOMETRY_KEYTOOL_PASSWORD)") |
                Set-Content -LiteralPath $signingProperties -Encoding ascii
            Write-Output 'Created local signing key in android/.signing/. Keep a private backup of this folder for future upgrades.'
        } elseif (!(Test-Path -LiteralPath $keyStoreFile)) { throw 'Signing properties exist but the key is missing. Restore the signing backup.' }
    }
    $tasks = @(':app:assembleRelease')
    if (!$SkipChecks) { $tasks = @(':app:testReleaseUnitTest', ':app:lintRelease') + $tasks }
    $arguments = $tasks + @('--console=plain')
    # Local proxy configuration stays outside source control.
    try {
        $destination = [uri]'https://dl.google.com'
        $proxy = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy($destination)
        if ($proxy -and $proxy.Host -ne $destination.Host) {
            $arguments += @("-Dhttps.proxyHost=$($proxy.Host)", "-Dhttps.proxyPort=$($proxy.Port)",
                "-Dhttp.proxyHost=$($proxy.Host)", "-Dhttp.proxyPort=$($proxy.Port)")
        }
    } catch { }
    Push-Location $androidProject
    try {
        & .\gradlew.bat @arguments
        if ($LASTEXITCODE -ne 0) { throw "Android build failed ($LASTEXITCODE)." }
    } finally { Pop-Location }
    $apk = Join-Path $androidProject 'app/build/outputs/apk/release/app-release.apk'
    if (!(Test-Path -LiteralPath $apk)) { throw 'No signed release APK was generated.' }
    if ([string]::IsNullOrWhiteSpace($sdkDirectory)) {
        $sdkDirectory = ((Get-Content -LiteralPath $localProperties | Where-Object { $_ -like 'sdk.dir=*' }) -replace '^sdk.dir=', '').Replace('\\', '\').Replace('\:', ':')
    }
    $apksigner = Join-Path $sdkDirectory 'build-tools/36.0.0/apksigner.bat'
    & $apksigner verify --verbose --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    $version = (Get-Content -LiteralPath (Join-Path $androidProject '../package.json') -Raw | ConvertFrom-Json).version
    $deliveryApk = Join-Path $androidProject "app/build/outputs/apk/release/GeometryPanel-$version.apk"
    Copy-Item -LiteralPath $apk -Destination $deliveryApk -Force
    $digest = (Get-FileHash -LiteralPath $deliveryApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadata = [ordered]@{
        version = $version; applicationId = 'app.geometrypanel.mobile'; apk = [IO.Path]::GetFileName($deliveryApk)
        sha256 = $digest; source = 'https://bedlatess.github.io/GeometryPanel/'; checksSkipped = [bool]$SkipChecks
        realDeviceVerified = $false; vehicleCommandsSent = $false
    }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $androidProject 'app/build/outputs/apk/release/verification.json') -Encoding utf8
    Write-Output "APK: $deliveryApk"
    Write-Output "SHA256: $digest"
} finally {
    $env:JAVA_HOME = $previousJava
    $env:GEOMETRY_KEYTOOL_PASSWORD = $previousKeytoolPassword
}

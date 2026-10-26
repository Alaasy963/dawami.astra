$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ownerPhone = Read-Host 'Owner phone (+country code, no spaces)'
if ($ownerPhone -notmatch '^\+[1-9]\d{7,14}$') { throw 'Use international format, for example +9639xxxxxxxx.' }
$ownerSecret = Read-Host 'Owner password (12-128 characters)' -AsSecureString
$ownerConfirm = Read-Host 'Repeat owner password' -AsSecureString
$secretPointer = [IntPtr]::Zero
$confirmPointer = [IntPtr]::Zero
try {
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ownerSecret)
    $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ownerConfirm)
    $ownerPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $confirmPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)
    if ($ownerPlain -cne $confirmPlain) { throw 'Passwords do not match. Run the script again.' }
    if ($ownerPlain.Length -lt 12 -or $ownerPlain.Length -gt 128) { throw 'Use 12 to 128 characters.' }
    $ownerHash = $ownerPlain | node scripts/owner-hash.mjs
    if ($LASTEXITCODE -ne 0 -or $ownerHash -notmatch '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$') { throw 'Password hashing failed.' }
} finally {
    if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
    if ($confirmPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer) }
    $ownerPlain = $null
    $confirmPlain = $null
    $ownerSecret.Dispose()
    $ownerConfirm.Dispose()
}
try {
    @{ OWNER_PHONE = $ownerPhone; OWNER_HASH = $ownerHash } | ConvertTo-Json -Compress | npx wrangler secret bulk --config wrangler.v2.toml
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare setup failed. Check the error above.' }
    Write-Host 'Owner configured. Sign in at https://dawami-v2.dawami-app.workers.dev using this phone and password.'
} finally {
    $ownerHash = $null
}

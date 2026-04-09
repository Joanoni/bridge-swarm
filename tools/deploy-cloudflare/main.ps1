param(
    [string]$ProjectName = "",
    [string]$Directory = ""
)


$Branch = "main"
$TempLog = Join-Path $env:TEMP "wrangler_output.log"

Write-Host "--- Starting Cloudflare Pages Deploy ---"

# 1. Validate Folder Existence
if (-not (Test-Path -Path $Directory)) {
    Write-Host "Error: Directory '$Directory' not found." -ForegroundColor Red
    exit
}
$FullDir = (Get-Item $Directory).FullName

# 2. Ensure Project Exists
# cmd /c prevents 'Assertion Failed' errors by isolating the Node.js process
$CreateCmd = "npx wrangler pages project create $ProjectName --production-branch main"
cmd /c "$CreateCmd" 2>$null

# 3. Execute Deploy
Write-Host "Uploading from: $FullDir"
$DeployCmd = "npx wrangler pages deploy `"$FullDir`" --project-name $ProjectName --branch $Branch"
cmd /c "$DeployCmd" > "$TempLog" 2>&1

# 4. Process Output
if (Test-Path $TempLog) {
    $RawOutput = Get-Content $TempLog -Raw
    Remove-Item $TempLog

    # Regex: Captures the stable URL part
    $Regex = "https://[a-zA-Z0-9-]+\.([a-zA-Z0-9-]+\.pages\.dev)"
    
    if ($RawOutput -match $Regex) {
        $CleanUrl = "https://$($Matches[1])"
        
        Write-Host ""
        Write-Host "Deploy Successful!" -ForegroundColor Green
        Write-Host "Clean URL: $CleanUrl" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "Error: Could not extract URL from log." -ForegroundColor Red
        Write-Host "Wrangler Output Log:"
        Write-Host $RawOutput
    }
}
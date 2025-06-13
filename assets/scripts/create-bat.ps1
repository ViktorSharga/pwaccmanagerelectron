# PowerShell script to create BAT files with proper Windows-1251 encoding
# Usage: powershell -ExecutionPolicy Bypass -File create-bat.ps1 -JsonPath "account.json" -GamePath "C:\Game\elementclient.exe" -OutputPath "output.bat"

param(
    [Parameter(Mandatory=$true)]
    [string]$JsonPath,
    
    [Parameter(Mandatory=$true)]
    [string]$GamePath,
    
    [Parameter(Mandatory=$true)]
    [string]$OutputPath
)

try {
    # Read account data from JSON file
    Write-Host "Reading account data from: $JsonPath"
    $accountJson = Get-Content -Path $JsonPath -Encoding UTF8 | ConvertFrom-Json
    
    Write-Host "Account: $($accountJson.login)"
    Write-Host "Character: $($accountJson.characterName)"
    
    # Get game directory and executable name
    $gameDir = Split-Path -Parent $GamePath
    $exeName = Split-Path -Leaf $GamePath
    
    # Build the batch file content
    $batchContent = @"
@echo off
chcp 1251
REM Account: $($accountJson.login)
REM Character: $($accountJson.characterName)
REM Server: $($accountJson.server)

cd /d "$gameDir"
"@
    
    # Build command parameters
    $params = @(
        "startbypatcher",
        "nocheck",
        "user:$($accountJson.login)",
        "pwd:$($accountJson.password)"
    )
    
    if ($accountJson.characterName -and $accountJson.characterName.Trim() -ne "") {
        $params += "role:$($accountJson.characterName)"
    }
    
    $params += "rendernofocus"
    
    $commandLine = "start `"`" `"$exeName`" " + ($params -join " ")
    $batchContent += "`r`n$commandLine`r`nexit`r`n"
    
    Write-Host "Generated command: $commandLine"
    
    # Write with Windows-1251 encoding
    Write-Host "Writing BAT file to: $OutputPath"
    $encoding = [System.Text.Encoding]::GetEncoding(1251)
    $bytes = $encoding.GetBytes($batchContent)
    [System.IO.File]::WriteAllBytes($OutputPath, $bytes)
    
    Write-Host "BAT file created successfully with Windows-1251 encoding"
    Write-Host "File size: $((Get-Item $OutputPath).Length) bytes"
    
    # Verify the file was created
    if (Test-Path $OutputPath) {
        Write-Host "SUCCESS: BAT file created at $OutputPath"
        exit 0
    } else {
        Write-Error "FAILED: BAT file was not created"
        exit 1
    }
    
} catch {
    Write-Error "Error creating BAT file: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
    exit 1
}
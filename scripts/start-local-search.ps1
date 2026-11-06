param([switch]$Setup)
$ErrorActionPreference = 'Stop'
$eginRoot = Split-Path -Parent $PSScriptRoot
$eginRuntime = Join-Path $env:LOCALAPPDATA 'EGIN/search-runtime'
$eginModel = Join-Path $env:LOCALAPPDATA 'EGIN/models/multilingual-minilm'
$eginPython = Join-Path $eginRuntime 'Scripts/python.exe'
if ($Setup) {
    if (!(Test-Path -LiteralPath $eginPython)) {
        python -m venv $eginRuntime
        if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment setup failed.' }
    }
    & $eginPython -m pip install -r (Join-Path $eginRoot 'apps/api/market-inference/requirements.txt') --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'Python dependencies installation failed.' }
    & $eginPython (Join-Path $eginRoot 'apps/api/market-inference/download.py') --model-dir $eginModel
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
}
if (!(Test-Path -LiteralPath $eginPython) -or !(Test-Path -LiteralPath (Join-Path $eginModel 'model.onnx'))) { throw 'Run this script with -Setup once to install the local model.' }
try {
    $eginHealth = Invoke-RestMethod 'http://127.0.0.1:4939/health' -TimeoutSec 2
    if ($eginHealth.model -eq 'paraphrase-multilingual-MiniLM-L12-v2') { Write-Output 'Local search model is already running on 127.0.0.1:4939.'; return }
} catch { }
$env:EGIN_MODEL_DIR = $eginModel
$eginProcess = Start-Process -FilePath $eginPython -ArgumentList @('-m','uvicorn','server:app','--host','127.0.0.1','--port','4939','--workers','1') -WorkingDirectory (Join-Path $eginRoot 'apps/api/market-inference') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:TEMP 'egin-local-search-out.log') -RedirectStandardError (Join-Path $env:TEMP 'egin-local-search-error.log') -PassThru
for ($eginAttempt = 0; $eginAttempt -lt 30; $eginAttempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $eginHealth = Invoke-RestMethod 'http://127.0.0.1:4939/health' -TimeoutSec 1
        if ($eginHealth.ok -and $eginHealth.model -eq 'paraphrase-multilingual-MiniLM-L12-v2') { Write-Output "Local model ready on 127.0.0.1:4939 (PID $($eginProcess.Id))."; return }
    } catch { }
    if ($eginProcess.HasExited) { break }
}
throw 'Local model did not start. Check %TEMP%/egin-local-search-error.log.'

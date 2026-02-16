# ShellForge - Start both backend and frontend

Write-Host "Starting ShellForge..." -ForegroundColor Green

# Start FastAPI backend in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; python -m uvicorn backend.api.main:app --reload --port 8000" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start React frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "ShellForge is starting!" -ForegroundColor Green
Write-Host "  API:      http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser." -ForegroundColor Yellow

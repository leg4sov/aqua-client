@echo off
rem Aqua - arranca la IA local SIN ventana (Windows). Para pararla: parar.bat
cd /d "%~dp0"
if not exist "modelos\Qwen3.5-4B-Q4_K_M.gguf" (echo No encuentro el modelo en la carpeta modelos & pause & exit /b 1)
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'win\llama-server.exe' -ArgumentList '-m','modelos\Qwen3.5-4B-Q4_K_M.gguf','--host','127.0.0.1','--port','23517','-c','8192','-lm','none' -RedirectStandardError 'iniciar.log'"
echo Cargando la IA en segundo plano, unos 30 s. Ya puedes cerrar esta ventana.
echo Para apagarla: doble clic en parar.bat
timeout /t 6 >nul

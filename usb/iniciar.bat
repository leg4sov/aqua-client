@echo off
rem Aqua · IA local desde el USB (Windows). No instala nada. Deja esta ventana abierta mientras uses Aqua.
cd /d "%~dp0"
set MODELO=modelos\Qwen3.5-4B-Q4_K_M.gguf
set PUERTO=23517
if not exist "%MODELO%" (echo No encuentro %MODELO%. Revisa el nombre del archivo .gguf. & pause & exit /b 1)
win\llama-server.exe -m "%MODELO%" --host 127.0.0.1 --port %PUERTO% -c 8192 --no-mmap
pause

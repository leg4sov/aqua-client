@echo off
rem Aqua - apaga la IA local y libera la RAM.
taskkill /IM llama-server.exe /F >nul 2>&1 && echo IA apagada. || echo La IA no estaba encendida.
timeout /t 3 >nul

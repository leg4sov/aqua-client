#!/bin/bash
# Aqua · arranca la IA local SIN ventana (en segundo plano). Para pararla: bash parar.sh
# Usa iniciar.sh por debajo; los mensajes y errores quedan en iniciar.log.
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/iniciar.log"
URL=http://127.0.0.1:23517
if curl -fs -m 2 "$URL/health" >/dev/null; then echo "La IA ya estaba encendida."; sleep 3; exit 0; fi
: > "$LOG"                                           # log limpio para esta vez
setsid nohup bash "$DIR/iniciar.sh" </dev/null >/dev/null 2>&1 &
echo "Cargando la IA en segundo plano (~30 s)..."
for i in $(seq 1 120); do
  sleep 1
  if grep -q "listening on" "$LOG" 2>/dev/null; then echo "Lista. Ya puedes cerrar esta ventana. Para apagarla: bash parar.sh"; sleep 4; exit 0; fi
  if grep -qE "ERROR|error:|se ha parado" "$LOG" 2>/dev/null; then echo "Falló al arrancar. Mira iniciar.log o lanza bash iniciar.sh para ver el error."; sleep 8; exit 1; fi
done
echo "Tarda demasiado. Mira iniciar.log."; sleep 8; exit 1

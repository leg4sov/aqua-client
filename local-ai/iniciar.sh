#!/bin/bash
# Aqua · IA local desde el USB (Linux). No instala nada. Uso: bash iniciar.sh  (deja la terminal abierta)
# Los USB suelen montarse sin permiso de ejecución: el programa se copia a ~/.aqua-llama y se ejecuta desde ahí.
# Todo lo que sale en pantalla se guarda también en iniciar.log (junto a este script) para revisar errores.
trap 'echo; read -rp "Pulsa Enter para cerrar..." _' EXIT      # la ventana no se cierra sola
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/iniciar.log"
MODELO="$DIR/modelos/Qwen3.5-4B-Q4_K_M.gguf"
PUERTO=23517
{
  echo "== $(date) =="
  [ -f "$MODELO" ] || { echo "ERROR: no encuentro $MODELO"; exit 1; }
  mkdir -p ~/.aqua-llama && cp -r "$DIR/linux/." ~/.aqua-llama/ || { echo "ERROR: no pude copiar linux/ a ~/.aqua-llama"; exit 1; }
  BIN="$(find ~/.aqua-llama -name llama-server -type f | head -n1)"
  [ -n "$BIN" ] || { echo "ERROR: no encuentro llama-server en linux/"; exit 1; }
  cd "$(dirname "$BIN")" && chmod +x ./* 2>/dev/null
  export LD_LIBRARY_PATH="$PWD${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  FALTAN=$(ldd "$BIN" ./*.so* 2>/dev/null | grep "not found" | sort -u)
  [ -z "$FALTAN" ] || echo "AVISO, faltan librerías del sistema:"$'\n'"$FALTAN"
  echo "Arrancando la IA en http://127.0.0.1:$PUERTO (deja esta ventana abierta; para pararla: Ctrl+C)"
  "$BIN" -m "$MODELO" --host 127.0.0.1 --port "$PUERTO" -c 8192 -lm none   # antes --no-mmap (quitado en llama.cpp 2026)
  echo "La IA se ha parado (código $?)."
} 2>&1 | tee "$LOG"

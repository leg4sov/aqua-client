#!/bin/bash
# Aqua · IA local desde el USB (Linux). No instala nada. Uso: bash iniciar.sh  (deja la terminal abierta)
# Los USB suelen montarse sin permiso de ejecución: el programa se copia a ~/.aqua-llama y se ejecuta desde ahí.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
MODELO="$DIR/modelos/Qwen3.5-4B-Q4_K_M.gguf"
PUERTO=23517
[ -f "$MODELO" ] || { echo "No encuentro $MODELO. Revisa el nombre del archivo .gguf."; exit 1; }
mkdir -p ~/.aqua-llama && cp -r "$DIR/linux/." ~/.aqua-llama/
BIN="$(find ~/.aqua-llama -name llama-server -type f | head -n1)"
chmod +x "$BIN"
cd "$(dirname "$BIN")"   # junto a sus librerías
exec "$BIN" -m "$MODELO" --host 127.0.0.1 --port "$PUERTO" -c 8192 --no-mmap

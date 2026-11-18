#!/bin/bash
# Aqua · descarga TODO lo necesario DENTRO de esta carpeta (llama.cpp para Windows y Linux + el modelo).
# No formatea ni borra nada del disco. Uso: bash descargar.sh   (si se corta, vuelve a lanzarlo: sigue donde iba)
trap 'echo; read -rp "Pulsa Enter para cerrar..." _' EXIT
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO=https://github.com/ggml-org/llama.cpp
MODELO="$DIR/modelos/Qwen3.5-4B-Q4_K_M.gguf"
MODELO_URL=https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf
TMP="$(mktemp -d)"                                   # temporales en /tmp, nunca en el disco
fallo() { echo; echo "ERROR: $*"; rm -rf "$TMP"; exit 1; }
bajar() { curl -fL --retry 5 --retry-delay 3 -C - --progress-bar -o "$2" "$1"; }
descomprimir_zip() {                                 # unzip si está; si no, python3 (Fedora siempre lo trae)
  if command -v unzip >/dev/null; then unzip -oq "$1" -d "$2"; else python3 -m zipfile -e "$1" "$2"; fi; }

command -v curl >/dev/null || fallo "falta curl (sudo dnf install curl)"
mkdir -p "$DIR/win" "$DIR/linux" "$DIR/modelos"

echo "1/4 Comprobando conexión..."
curl -fsS -m 15 -o /dev/null https://github.com || fallo "no llego a github.com. Revisa la conexión y reintenta."

echo "2/4 Buscando la última versión de llama.cpp..."
# Sin la API de GitHub (tiene límite de consultas): se mira a qué versión redirige "latest".
TAG=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$REPO/releases/latest" | sed 's|.*/tag/||')
# Desde v1.0.0 (nov 2026) las versiones "vX.Y.Z" no traen programas: nightly-tag.txt dice qué build "bNNNN" usar.
if [[ ! "$TAG" =~ ^b[0-9]+$ ]] && [ -n "$TAG" ]; then
  TAG=$(curl -fsSL "$REPO/releases/download/$TAG/nightly-tag.txt" | tr -d '[:space:]')
fi
[[ "$TAG" =~ ^b[0-9]+$ ]] || fallo "no pude leer la versión (salió: '$TAG'). Reintenta en un rato."
echo "  versión $TAG"
BASE="$REPO/releases/download/$TAG/llama-$TAG-bin"

if [ -f "$DIR/win/llama-server.exe" ]; then echo "  Windows: ya está"
else
  echo "  Windows: bajando..."
  bajar "$BASE-win-cpu-x64.zip" "$TMP/win.zip" || fallo "no se pudo bajar la versión de Windows."
  descomprimir_zip "$TMP/win.zip" "$DIR/win" || fallo "no se pudo descomprimir la versión de Windows."
fi

if [ -n "$(find "$DIR/linux" -name llama-server -type f 2>/dev/null)" ]; then echo "  Linux: ya está"
else
  echo "  Linux: bajando..."
  if bajar "$BASE-ubuntu-x64.tar.gz" "$TMP/lin.tar.gz"; then
    tar -xzf "$TMP/lin.tar.gz" -C "$DIR/linux" || fallo "no se pudo descomprimir la versión de Linux."
  elif bajar "$BASE-ubuntu-x64.zip" "$TMP/lin.zip"; then
    descomprimir_zip "$TMP/lin.zip" "$DIR/linux" || fallo "no se pudo descomprimir la versión de Linux."
  else fallo "no se pudo bajar la versión de Linux."; fi
fi

echo "3/4 Bajando el modelo (~3 GB, puede tardar)..."
if [ -f "$MODELO" ] && [ "$(stat -c%s "$MODELO")" -gt 2900000000 ]; then echo "  ya está"
else bajar "$MODELO_URL" "$MODELO" || fallo "se cortó la descarga del modelo. Vuelve a lanzar el script: seguirá donde iba."; fi

echo "4/4 Comprobando..."
[ -f "$DIR/win/llama-server.exe" ] || fallo "falta win/llama-server.exe"
[ -n "$(find "$DIR/linux" -name llama-server -type f)" ] || fallo "falta llama-server en linux/"
[ "$(stat -c%s "$MODELO")" -gt 2900000000 ] || fallo "el modelo está incompleto. Vuelve a lanzar el script."
rm -rf "$TMP"
echo; echo "TODO LISTO. Para arrancar la IA: bash iniciar.sh  (en Windows: doble clic en iniciar.bat)"

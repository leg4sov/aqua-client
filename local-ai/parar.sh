#!/bin/bash
# Aqua · apaga la IA local (la arrancada con iniciar.sh o iniciar-oculto.sh) y libera la RAM.
if pkill -f '\.aqua-llama/.*llama-server'; then echo "IA apagada."; else echo "La IA no estaba encendida."; fi
sleep 3

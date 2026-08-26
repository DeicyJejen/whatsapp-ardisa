#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  CONSULTAR LA TIENDA EN LÍNEA  ·  para aprender viendo, sin pelear con comillas
#
#  Uso:   bash tienda.sh eterboard          -> busca por nombre (como el cliente)
#         bash tienda.sh "sanitario elongado"
#         bash tienda.sh --sku 10021733     -> pregunta por CÓDIGO exacto (+ precio)
#         bash tienda.sh --sku 10010338     -> uno que NO está publicado
#
#  Es la MISMA consulta que hace el bot desde n8n (build_f1.py:4306).
# ══════════════════════════════════════════════════════════════════════════════
WEB="https://www.ardisa.com"
UA="Mozilla/5.0"      # sin esta cabecera Magento responde 403: cree que somos un robot

# --- consulta por CÓDIGO exacto: ¿existe la ficha? ¿a qué precio? -------------
if [ "$1" = "--sku" ]; then
  SKU="$2"
  echo "→ Preguntando a la tienda por el código exacto $SKU"
  curl -s "$WEB/graphql" \
    -H 'Content-Type: application/json' -H "User-Agent: $UA" \
    -d "{\"query\":\"{products(filter:{sku:{eq:\\\"$SKU\\\"}}){items{sku name url_key price_range{minimum_price{final_price{value}}}}}}\"}" \
    | python3 -m json.tool          # json.tool solo lo imprime ORDENADO, no cambia nada
  exit 0
fi

# --- búsqueda por NOMBRE: esta pasa por OpenSearch (perdona errores de escritura)
Q="${1:-cemento}"                   # si no escribes nada, busca "cemento"
echo "→ Buscando \"$Q\" en la tienda (motor OpenSearch, el mismo de la página)"
curl -s "$WEB/graphql" \
  -H 'Content-Type: application/json' -H "User-Agent: $UA" \
  -d "{\"query\":\"{products(search:\\\"$Q\\\",pageSize:5){total_count items{sku name url_key}}}\"}" \
  | python3 -m json.tool

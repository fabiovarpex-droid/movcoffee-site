# `/data` — Mapa de Potencial de Mercado

Estes dois arquivos alimentam `mapa-potencial.html`. **Nada é hardcoded no
código** — `js/mapa.js` lê os dois arquivos abaixo em tempo de execução
(`fetch`).

## `base_pontos.csv` — ⚠️ DADO REAL NECESSÁRIO

Hoje é um **CSV de demonstração**: derivado do fixture `base_pontos_SELFTEST.csv`
(valores sintéticos), com os códigos/nomes de município **remapeados para cidades
reais do IBGE** para a demo ficar apresentável (Curitiba, Salvador, Londrina etc.)
e para o join com a malha funcionar. O remap preservou o ranking: a maior cidade
sintética de cada UF virou a maior cidade real da UF, e assim por diante
(script: `remap-cidades.js`, rodado uma única vez).

**Os NÚMEROS continuam sintéticos** — qtd de pontos, faturamento, prioridade e
confiança não refletem o mercado real dessas cidades. **Substitua por um
`base_pontos.csv` de produção antes de publicar**, gerado por `gerar_base.py`
(ver `readme.docx` da fase 2) a partir de dados reais do IBGE.

As linhas agregadas usam o rótulo `Interior de [UF]` (o gerador da fase 2 grava
`Demais municípios - [UF]`; o site aceita os dois formatos).

O arquivo precisa manter exatamente este cabeçalho (`js/mapa.js` lê por nome de
coluna, não por posição):

```
id,uf,municipio,codigo_ibge,regiao,canal,subcanal,tier,qtd_pontos_estimados,
fluxo_diario_estimado,ticket_medio_estimado,faturamento_mensal_estimado,
prioridade_expansao,fonte_dado,ano_base,metodologia_aplicada,nivel_confianca
```

Linhas agregadas (`codigo_ibge` vazio, `municipio` = "Demais municípios - UF")
são tratadas de forma diferente no mapa — ver seção 06 da spec.

## Pipeline fase 3 — shoppings por lista nominal

O canal **shopping** já não usa proxy demográfico: as contagens vêm de um
**censo nominal** (um shopping = uma linha), processado por
`pipeline/pipeline-shoppings.js`:

```bash
cd data/pipeline
node pipeline-shoppings.js     # lê ../fontes/shoppings.csv e regrava ../base_pontos.csv
```

- **`fontes/shoppings.csv`** — ⚠️ DADO REAL NECESSÁRIO. Hoje contém shoppings
  **sintéticos** ("Shopping Demo …") em municípios reais, só para a demo rodar.
  Substitua pelo export do Censo ABRASCE (schema:
  `id,nome,uf,municipio,codigo_ibge,abl_m2,ano_ref`). Este arquivo é **interno**
  — o site nunca exibe nome nem endereço de shopping (a spec proíbe); só as
  contagens agregadas por município chegam ao navegador.
- **`pipeline/params-shoppings.json`** — qualificação (ABL mínima) e corte de
  tier (ABL premium). São PREMISSAS — ajuste e rode de novo.
- O pipeline valida a lista (código IBGE × UF, ABL > 0, duplicatas — falha
  explícita), qualifica, agrega por município × tier (fora do top-100 soma em
  "Interior de UF"), substitui as linhas de shopping da base, recalcula
  `prioridade_expansao` de toda a base e grava
  `metodologia_aplicada = "lista nominal ABRASCE …"` — é essa marca que faz o
  site exibir o selo **"✓ censo setorial"** no canal.
- Para os demais canais (ANAC, CNES, INEP, RAIS), replicar este mesmo molde.

## `malha-ufs-br.json` — malha dos estados (TopoJSON)

Os 27 estados, dissolvidos a partir da malha municipal (mesma fonte/licença).
Usada no nível "Brasil" da navegação do mapa. Regenerar:

```bash
npx mapshaper geojs-100-mun.json -each 'pref=id.substring(0,2)' -dissolve pref \
  -simplify 4% keep-shapes planar -o format=topojson quantization=1e5 malha-ufs-br.json
```

## `malha-municipios-br.json` — malha geográfica (TopoJSON)

Contorno dos municípios brasileiros, já simplificado para uso web. **Fonte:**
[`tbrugz/geodata-br`](https://github.com/tbrugz/geodata-br) (dados originais
do IBGE, licença CC0 — domínio público), arquivo `geojson/geojs-100-mun.json`
(Brasil inteiro, 5.564 municípios).

Cada feature tem só a propriedade `id` = `codigo_ibge` (string, 7 dígitos) —
é a chave de junção com `base_pontos.csv`. Nome do município, UF etc. vêm
sempre do CSV, nunca da malha, para não haver duas fontes de verdade.

### Simplificação aplicada (documentação obrigatória — ver restrição da spec)

O arquivo original tem **22,5 MB** (5.564 polígonos em resolução alta —
inviável para carregar no celular numa reunião). Foi processado com
[mapshaper](https://github.com/mbloch/mapshaper) (CLI, via `npx mapshaper`):

```bash
npx mapshaper geojs-100-mun.json \
  -simplify 5% keep-shapes planar \
  -filter-fields id \
  -o format=topojson quantization=1e5 malha-municipios-br.json
```

| Parâmetro | Valor | Por quê |
|---|---|---|
| `-simplify 5%` | mantém 5% dos vértices originais | resolução de detalhe compatível com visualização nacional/estadual — o mapa nunca precisa de precisão de quadra |
| `keep-shapes` | ativado | impede que municípios pequenos (área pequena) desapareçam completamente na simplificação — todo município continua clicável |
| `planar` | ativado | simplificação em coordenadas planas (mais rápida; erro desprezível na escala do Brasil) |
| `-filter-fields id` | remove `name`/`description` | nome vem do CSV; reduz ainda mais o arquivo |
| `format=topojson` | em vez de GeoJSON | TopoJSON deduplica fronteiras compartilhadas entre municípios vizinhos — para uma malha contígua de 5.564 polígonos isso pesa muito no tamanho final |
| `quantization=1e5` | grade de 100.000 células sobre o bounding box do Brasil | ~ 30–50 m de resolução — imperceptível em qualquer zoom que o mapa oferece |

**Resultado:** 22,5 MB → **1,23 MB** (≈ **365 KB comprimido/gzip**, que é o que
de fato trafega — hospedagem estática como Vercel/Cloudflare Pages já serve
gzip/brotli automaticamente). O log do `mapshaper` acusou ~950 interseções que
não puderam ser 100% reparadas na simplificação; na escala de visualização do
mapa (nacional → estadual → municipal) isso não é perceptível. Se algum dia
for necessário mais detalhe (ex.: um zoom por bairro, fora do escopo desta
fase), gere de novo a partir de `geojs-100-mun.json` com um `-simplify` menos
agressivo.

`js/mapa.js` carrega o TopoJSON e converte para GeoJSON no navegador com a
biblioteca `topojson-client` (~5 KB, via CDN) antes de entregar ao Leaflet.

### Como regenerar

```bash
curl -o geojs-100-mun.json https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-100-mun.json
npx mapshaper geojs-100-mun.json -simplify 5% keep-shapes planar -filter-fields id -o format=topojson quantization=1e5 malha-municipios-br.json
```

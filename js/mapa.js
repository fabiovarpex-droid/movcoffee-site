/* ============================================================
   Mov Coffee — Mapa de Potencial de Mercado
   Nenhum número de negócio está hardcoded aqui: tudo vem de
   data/base_pontos.csv (potencial por município/canal/tier) e de
   data/malha-municipios-br.json (contorno geográfico). Ver spec
   e data/README.md para a metodologia completa.
   ============================================================ */
"use strict";

const CSV_URL = "data/base_pontos.csv";
const MALHA_URL = "data/malha-municipios-br.json";
const MALHA_UFS_URL = "data/malha-ufs-br.json";

// Corte de agregação usado na geração da base (ver readme.docx / gerar_base.py,
// escopo.top_n_municipios). Só usado para o texto do drawer "Como calculamos" —
// a lógica de detecção de "top" x "residual" não depende deste número: é
// derivada diretamente de quais codigo_ibge aparecem como linha individual no CSV.
const TOP_N_MUNICIPIOS = 100;

// Nomes por extenso das UFs e prefixo do código IBGE (fato de nomenclatura do
// IBGE, não um número de negócio — mesmo mapeamento usado em gerar_base.py).
const UF_NOMES = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
const UF_PREFIXO = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};
const PREFIXO_UF = Object.fromEntries(Object.entries(UF_PREFIXO).map(([uf, p]) => [p, uf]));

// Linhas agregadas por UF: o gerador grava "Demais municípios - UF"; a base de
// demonstração usa o rótulo mais amigável "Interior de UF". Aceita os dois.
const ROTULO_AGREGADO_RE = /^(Demais municípios|Interior de)/i;

// Nomenclatura amigável por canal (rótulo de interface — o dado técnico continua
// vindo do CSV em `canal`/`subcanal`; fallback para o subcanal se surgir canal novo).
const CANAL_INFO = {
  academia: { emoji: "🏋️", curto: "Academias", plural: "academias potenciais" },
  supermercado: { emoji: "🛒", curto: "Supermercados", plural: "supermercados potenciais" },
  shopping: { emoji: "🏬", curto: "Shoppings", plural: "shoppings potenciais" },
  hospital: { emoji: "🏥", curto: "Hospitais", plural: "hospitais potenciais" },
  universidade: { emoji: "🎓", curto: "Universidades", plural: "universidades potenciais" },
  planta_industrial: { emoji: "🏭", curto: "Indústrias e CDs", plural: "indústrias/CDs potenciais" },
  aeroporto: { emoji: "✈️", curto: "Aeroportos", plural: "aeroportos potenciais" },
};
function canalCurto(canal, subcanal) { return CANAL_INFO[canal]?.curto || subcanal || canal; }
function canalEmoji(canal) { return CANAL_INFO[canal]?.emoji || "📍"; }
function canalPlural(canal, subcanal) { return CANAL_INFO[canal]?.plural || subcanal || canal; }

// Canal alimentado por LISTA NOMINAL (censo setorial real) em vez de proxy
// demográfico — detectado pela string de metodologia gravada pelo pipeline.
const METODO_NOMINAL_RE = /^lista nominal/i;
function linhaEhNominal(r) { return METODO_NOMINAL_RE.test(r.metodologia_aplicada || ""); }
function canalEhNominal(canal) {
  return Dados.linhas.some((r) => r.canal === canal && linhaEhNominal(r));
}

const NIVEL_ORDEM = { baixo: 0, medio: 1, alto: 2 };
const NIVEL_ROTULO = { baixo: "Baixa", medio: "Média", alto: "Alta" };

/* ============================================================
   1. PARSER CSV (RFC4180 mínimo — sem dependência externa)
   ============================================================ */
function parseCSV(texto) {
  const linhas = [];
  let campo = "", linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ",") {
      linha.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }

  const cab = linhas.shift();
  return linhas.map((cols) => {
    const obj = {};
    cab.forEach((chave, idx) => (obj[chave.trim()] = (cols[idx] ?? "").trim()));
    return obj;
  });
}

function normalizarTexto(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function fmtInt(n) { return new Intl.NumberFormat("pt-BR").format(Math.round(n)); }
function fmtMoeda(n) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n); }

function bandaPrioridade(valor) {
  if (valor >= 67) return "Alta";
  if (valor >= 34) return "Média";
  return "Observação";
}

/* ============================================================
   2. ESTADO GLOBAL DOS DADOS (preenchido no bootstrap)
   ============================================================ */
const Dados = {
  linhas: [],              // todas as linhas do CSV, tipadas
  canais: [],               // [{canal, subcanal}]
  ufs: [],                  // ['SP','RJ', ...] com dado
  porMunicipio: new Map(),  // codigo_ibge -> { municipio, uf, regiao, linhas: [] }
  agregadoPorUF: new Map(), // uf -> { linhas: [] }  (linhas "Demais municípios - UF")
  topPorUF: new Map(),      // uf -> Set(codigo_ibge) individualizados
  geojson: null,            // FeatureCollection municipal convertida do topojson
  geojsonUFs: null,         // FeatureCollection dos 27 estados (malha dissolvida)
};

async function carregarDados() {
  const [csvTexto, topo, topoUFs] = await Promise.all([
    fetch(CSV_URL).then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar " + CSV_URL);
      return r.text();
    }),
    fetch(MALHA_URL).then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar " + MALHA_URL);
      return r.json();
    }),
    fetch(MALHA_UFS_URL).then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar " + MALHA_UFS_URL);
      return r.json();
    }),
  ]);

  const brutas = parseCSV(csvTexto);
  const canalSet = new Map();
  const ufSet = new Set();

  brutas.forEach((r) => {
    r.qtd_pontos_estimados = Number(r.qtd_pontos_estimados) || 0;
    r.fluxo_diario_estimado = Number(r.fluxo_diario_estimado) || 0;
    r.ticket_medio_estimado = Number(r.ticket_medio_estimado) || 0;
    r.faturamento_mensal_estimado = Number(r.faturamento_mensal_estimado) || 0;
    r.prioridade_expansao = Number(r.prioridade_expansao) || 0;
    r.ano_base = r.ano_base;

    canalSet.set(r.canal, r.subcanal);
    ufSet.add(r.uf);

    const agregado = !r.codigo_ibge || ROTULO_AGREGADO_RE.test(r.municipio);
    if (agregado) {
      if (!Dados.agregadoPorUF.has(r.uf)) Dados.agregadoPorUF.set(r.uf, []);
      Dados.agregadoPorUF.get(r.uf).push(r);
    } else {
      if (!Dados.porMunicipio.has(r.codigo_ibge)) {
        Dados.porMunicipio.set(r.codigo_ibge, {
          codigo_ibge: r.codigo_ibge, municipio: r.municipio, uf: r.uf, regiao: r.regiao, linhas: [],
        });
      }
      Dados.porMunicipio.get(r.codigo_ibge).linhas.push(r);
      if (!Dados.topPorUF.has(r.uf)) Dados.topPorUF.set(r.uf, new Set());
      Dados.topPorUF.get(r.uf).add(r.codigo_ibge);
    }
  });

  Dados.linhas = brutas;
  Dados.canais = [...canalSet.entries()].map(([canal, subcanal]) => ({ canal, subcanal }));
  Dados.ufs = [...ufSet].sort();

  // TopoJSON -> GeoJSON (a lib topojson-client faz a expansão das arcos).
  const chaveObjeto = Object.keys(topo.objects)[0];
  Dados.geojson = topojson.feature(topo, topo.objects[chaveObjeto]);
  const chaveUFs = Object.keys(topoUFs.objects)[0];
  Dados.geojsonUFs = topojson.feature(topoUFs, topoUFs.objects[chaveUFs]);
}

/* ============================================================
   3. FILTROS ATIVOS + AGREGAÇÃO CONFORME RECORTE
   ============================================================ */
const Filtro = {
  uf: "",
  canais: new Set(),      // Set explícito dos canais selecionados — preenchido com
                           // todos os canais no bootstrap (montarFiltros); nunca fica
                           // "vazio implicando todos" para evitar ambiguidade com o
                           // caso em que o usuário desliga todos os chips.
  tier: "ambos",           // ambos | premium | convencional
  soPrioridadeAlta: false,
};

function linhaPassaFiltro(r) {
  if (!Filtro.canais.has(r.canal)) return false;
  if (Filtro.tier !== "ambos" && r.tier !== Filtro.tier) return false;
  return true;
}

// Soma qtd_pontos_estimados + agrega confiança/prioridade/fontes de um conjunto de linhas
function agregarLinhas(linhas) {
  const validas = linhas.filter(linhaPassaFiltro);
  if (!validas.length) return null;
  const soma = validas.reduce((s, r) => s + r.qtd_pontos_estimados, 0);
  const faturamento = validas.reduce((s, r) => s + r.faturamento_mensal_estimado, 0);
  const confiancaMin = validas.reduce((min, r) => Math.min(min, NIVEL_ORDEM[r.nivel_confianca] ?? 1), 2);
  const nivel_confianca = Object.keys(NIVEL_ORDEM).find((k) => NIVEL_ORDEM[k] === confiancaMin);
  const prioridadeMedia = validas.reduce((s, r) => s + r.prioridade_expansao, 0) / validas.length;
  const fontes = [...new Map(validas.map((r) => [r.fonte_dado + r.ano_base, r])).values()]
    .map((r) => `${r.fonte_dado}, ${r.ano_base}`);
  return { qtd: soma, faturamento, nivel_confianca, prioridade: prioridadeMedia, linhas: validas, fontes };
}

// Valor agregado (para o coroplético) de um município individualizado
function valorMunicipio(codigo_ibge) {
  const m = Dados.porMunicipio.get(codigo_ibge);
  if (!m) return null;
  return agregarLinhas(m.linhas);
}
// Valor agregado residual de uma UF ("Demais municípios")
function valorResidualUF(uf) {
  const linhas = Dados.agregadoPorUF.get(uf) || [];
  return agregarLinhas(linhas);
}

/* ============================================================
   4. ESCALA DE COR (SAM) — sequencial, quantis sobre os valores visíveis
   ============================================================ */
const RAMPA_COR = ["#2b2e28", "#4a3826", "#7a4a26", "#b25f2a", "#e57433", "#ff9a5c"];

function construirEscala(valores) {
  const nums = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nums.length) return { breaks: [], colorFor: () => RAMPA_COR[0] };
  const n = RAMPA_COR.length;
  const breaks = [];
  for (let i = 1; i < n; i++) {
    breaks.push(nums[Math.min(nums.length - 1, Math.floor((i / n) * nums.length))]);
  }
  function colorFor(v) {
    if (!v || v <= 0) return RAMPA_COR[0];
    for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return RAMPA_COR[i];
    return RAMPA_COR[RAMPA_COR.length - 1];
  }
  return { breaks, colorFor, max: nums[nums.length - 1] };
}

function desenharLegendaEscala(escala) {
  const el = document.getElementById("mp-escala-sam");
  el.innerHTML = "";
  RAMPA_COR.forEach((cor) => {
    const s = document.createElement("span");
    s.style.background = cor;
    el.appendChild(s);
  });
  // substitui (não acumula) a linha de rótulos min/max
  el.parentElement.querySelector(".mp-legenda-escala-rotulos")?.remove();
  const rotulos = document.createElement("div");
  rotulos.className = "mp-legenda-escala-rotulos";
  rotulos.innerHTML = `<span>menor</span><span>${escala.max ? fmtInt(escala.max) + " pts" : "—"}</span>`;
  el.parentElement.appendChild(rotulos);
}

/* ============================================================
   5. MAPA (Leaflet + GeoJSON) — navegação em DOIS NÍVEIS
   Nível Brasil: 27 estados clicáveis (malha dissolvida, leve).
   Nível estado: só os municípios da UF escolhida (rápido e legível).
   IMPORTANTE: o renderer canvas do Leaflet IGNORA classes CSS — todo
   estilo (cor de traço, tracejado de confiança) é passado direto no
   objeto de style, nunca via className.
   ============================================================ */
let mapa, camadaUFs, camadaMunicipiosUF = null;
const layersPorId = new Map();  // codigo_ibge -> layer (apenas da UF em exibição)
const ufLayers = new Map();     // uf -> layer do polígono estadual
const cacheGeoUF = new Map();   // uf -> features municipais da UF
let vistaUF = null;             // UF cujos municípios estão em exibição (null = Brasil)

// Traço por nível de confiança (aplicado direto no canvas — ver nota acima)
const CONF_TRACO = {
  alto:  { color: "#3fbf6a", dashArray: null,  weight: 1.7 },
  medio: { color: "#e0a94a", dashArray: "5 4", weight: 1.3 },
  baixo: { color: "#8b9088", dashArray: "2 3", weight: 1.0 },
};

function ufDoCodigo(codigo_ibge) {
  return PREFIXO_UF[codigo_ibge.slice(0, 2)] || null;
}

// Total do estado inteiro (cidades individualizadas + interior agregado)
function valorEstado(uf) {
  const idsTop = [...(Dados.topPorUF.get(uf) || [])];
  const linhas = idsTop.flatMap((id) => Dados.porMunicipio.get(id).linhas)
    .concat(Dados.agregadoPorUF.get(uf) || []);
  return agregarLinhas(linhas);
}

let escalaAtual = { colorFor: () => RAMPA_COR[0] };   // municípios (UF ativa)
let escalaUFs = { colorFor: () => RAMPA_COR[0] };     // estados (visão Brasil)
let realceAtivo = null; // codigo_ibge ou 'UF:xx' em destaque

function iniciarMapa() {
  mapa = L.map("mp-leaflet", {
    center: [-14.2, -51.9],
    zoom: 4,
    minZoom: 3,
    maxZoom: 11,
    zoomControl: false,
    renderer: L.canvas({ padding: 0.4 }),
    attributionControl: true,
  });
  L.control.zoom({ position: "bottomright" }).addTo(mapa);
  mapa.attributionControl.setPrefix("");
  mapa.attributionControl.addAttribution("Malha municipal: IBGE, via geodata-br (CC0)");
  // Sem tile de fundo: o coroplético é a única camada visual, sobre o grafite
  // do site — evita depender de serviço externo de tiles.

  camadaUFs = L.geoJSON(Dados.geojsonUFs, {
    style: estiloUF,
    onEachFeature: (feature, layer) => {
      const uf = PREFIXO_UF[feature.properties.pref];
      if (uf) ufLayers.set(uf, layer);
      layer.on("click", () => { if (uf) selecionarUF(uf); });
      layer.on("mouseover", () => { if (!vistaUF) layer.setStyle({ weight: 2.4, color: "#ff9a5c" }); });
      layer.on("mouseout", () => camadaUFs.resetStyle(layer));
      layer.bindTooltip(() => {
        const nome = UF_NOMES[uf] || uf || "—";
        if (vistaUF) return `<span class="tt-nome">${nome}</span><br><span class="tt-conf">Toque para trocar de estado</span>`;
        const agregado = uf ? valorEstado(uf) : null;
        if (!agregado) return `<span class="tt-nome">${nome}</span><br><span class="tt-conf">Sem estimativa neste recorte</span>`;
        return `<span class="tt-nome">${nome}</span><br>` +
          `<span class="tt-pts">${fmtInt(agregado.qtd)} pontos potenciais</span><br>` +
          `<span class="tt-conf">Toque para ver as cidades</span>`;
      }, { sticky: true, direction: "top", className: "mp-tooltip", opacity: 1 });
    },
  }).addTo(mapa);

  document.getElementById("mp-btn-brasil").addEventListener("click", () => {
    document.getElementById("f-uf").value = "";
    Filtro.uf = "";
    mostrarBrasil();
    fecharPainel();
    montarTopOportunidades();
  });

  mapa.fitBounds(camadaUFs.getBounds(), { padding: [8, 8] });
}

function estiloUF(feature) {
  const uf = PREFIXO_UF[feature.properties.pref];
  if (vistaUF) {
    // Modo estado: a UF ativa fica invisível (municípios desenhados por cima);
    // as demais escurecem para virar contexto.
    if (uf === vistaUF) return { weight: 0, opacity: 0, fillOpacity: 0 };
    return { color: "#31352e", weight: 0.8, opacity: 0.9, fillColor: "#151713", fillOpacity: 0.8 };
  }
  const agregado = uf ? valorEstado(uf) : null;
  if (!agregado) return { color: "#3a3d37", weight: 0.8, fillColor: "#1c1e1a", fillOpacity: 0.55 };
  return { color: "#6b7065", weight: 1, fillColor: escalaUFs.colorFor(agregado.qtd), fillOpacity: 0.85 };
}

function estiloFeature(feature) {
  const id = feature.properties.id;
  const uf = ufDoCodigo(id);
  const isTop = Dados.topPorUF.get(uf)?.has(id);
  const agregado = isTop ? valorMunicipio(id) : valorResidualUF(uf);

  if (!agregado) {
    return { color: "#3a3d37", weight: 0.6, fillColor: "#1c1e1a", fillOpacity: 0.5 };
  }

  const cor = escalaAtual.colorFor(agregado.qtd);
  const t = CONF_TRACO[agregado.nivel_confianca] || CONF_TRACO.medio;
  const prioridadeAlta = bandaPrioridade(agregado.prioridade) === "Alta";
  const apagado = Filtro.soPrioridadeAlta && !prioridadeAlta;
  const realce = (isTop && realceAtivo === id) || (!isTop && realceAtivo === "UF:" + uf);

  return {
    color: realce ? "#ffffff" : t.color,
    dashArray: realce ? null : t.dashArray,
    weight: realce ? 2.6 : t.weight,
    fillColor: cor,
    fillOpacity: apagado ? 0.15 : (isTop ? 0.85 : 0.5),
    opacity: apagado ? 0.3 : 1,
  };
}

function mostrarUF(uf) {
  if (vistaUF === uf) return;
  if (camadaMunicipiosUF) { mapa.removeLayer(camadaMunicipiosUF); camadaMunicipiosUF = null; }
  layersPorId.clear();
  vistaUF = uf;

  let feats = cacheGeoUF.get(uf);
  if (!feats) {
    feats = Dados.geojson.features.filter((f) => ufDoCodigo(f.properties.id) === uf);
    cacheGeoUF.set(uf, feats);
  }
  camadaMunicipiosUF = L.geoJSON({ type: "FeatureCollection", features: feats }, {
    style: estiloFeature,
    onEachFeature: (feature, layer) => {
      const id = feature.properties.id;
      layersPorId.set(id, layer);
      layer.on("click", () => selecionarMunicipio(id));
      layer.on("mouseover", () => layer.setStyle({ weight: 2.6, color: "#ffffff", dashArray: null }));
      layer.on("mouseout", () => camadaMunicipiosUF.resetStyle(layer));
      layer.bindTooltip(() => {
        const isTop = Dados.topPorUF.get(uf)?.has(id);
        const agregado = isTop ? valorMunicipio(id) : valorResidualUF(uf);
        const nome = isTop ? Dados.porMunicipio.get(id).municipio : `Interior de ${uf} (agregado)`;
        if (!agregado) return `<span class="tt-nome">${nome}</span><br><span class="tt-conf">Sem estimativa neste recorte</span>`;
        return `<span class="tt-nome">${nome}</span><br>` +
          `<span class="tt-pts">${fmtInt(agregado.qtd)} pontos potenciais</span><br>` +
          `<span class="tt-conf">Confiança ${NIVEL_ROTULO[agregado.nivel_confianca]} · toque para detalhes</span>`;
      }, { sticky: true, direction: "top", className: "mp-tooltip", opacity: 1 });
    },
  }).addTo(mapa);

  camadaUFs.setStyle(estiloUF);
  const b = ufLayers.get(uf)?.getBounds();
  if (b) mapa.fitBounds(b, { padding: [14, 14] });
  document.getElementById("mp-btn-brasil").hidden = false;
  recalcularMapa();
}

function mostrarBrasil() {
  if (camadaMunicipiosUF) { mapa.removeLayer(camadaMunicipiosUF); camadaMunicipiosUF = null; }
  layersPorId.clear();
  vistaUF = null;
  realceAtivo = null;
  camadaUFs.setStyle(estiloUF);
  mapa.fitBounds(camadaUFs.getBounds(), { padding: [8, 8] });
  document.getElementById("mp-btn-brasil").hidden = true;
  recalcularMapa();
}

// Seleciona um estado: entra no nível municipal + abre o card do estado
function selecionarUF(uf, { abrirCard = true } = {}) {
  Filtro.uf = uf;
  document.getElementById("f-uf").value = uf;
  mostrarUF(uf);
  if (abrirCard) abrirPainel("uf", uf);
  montarTopOportunidades();
}

function recalcularMapa() {
  // escala dos estados (visão Brasil)
  const valoresUF = [];
  Dados.ufs.forEach((uf) => {
    const agregado = valorEstado(uf);
    if (agregado) valoresUF.push(agregado.qtd);
  });
  escalaUFs = construirEscala(valoresUF);

  // escala municipal (apenas UF ativa — contraste melhor dentro do estado)
  if (vistaUF) {
    const valores = [];
    (cacheGeoUF.get(vistaUF) || []).forEach((f) => {
      const id = f.properties.id;
      const isTop = Dados.topPorUF.get(vistaUF)?.has(id);
      const agregado = isTop ? valorMunicipio(id) : valorResidualUF(vistaUF);
      if (agregado) valores.push(agregado.qtd);
    });
    escalaAtual = construirEscala(valores);
  }

  desenharLegendaEscala(vistaUF ? escalaAtual : escalaUFs);
  document.querySelector("#mp-legenda .mp-legenda-titulo").textContent =
    vistaUF ? `Potencial (SAM) — cidades de ${vistaUF}` : "Potencial (SAM) — por estado";

  if (camadaUFs) camadaUFs.setStyle(estiloUF);
  if (camadaMunicipiosUF) camadaMunicipiosUF.setStyle(estiloFeature);
  atualizarFontesRodape();
  montarTopOportunidades();
  montarStats();
  if (document.getElementById("mp-lista").hidden === false) montarLista();
  if (!document.getElementById("mp-painel").classList.contains("aberto")) return;
  // se o painel estiver aberto, atualiza o conteúdo com o novo recorte
  if (painelAtual) abrirPainel(painelAtual.tipo, painelAtual.chave);
}

function atualizarFontesRodape() {
  const fontes = [...new Map(
    Dados.linhas
      .filter((r) => Filtro.canais.has(r.canal))
      .map((r) => [r.fonte_dado + r.ano_base, `${r.fonte_dado}, ${r.ano_base}`])
  ).values()];
  document.getElementById("mp-fontes-rodape").textContent = fontes.length ? "[" + fontes.join("; ") + "]" : "[nenhum canal selecionado]";
}

/* ============================================================
   6. FILTROS — UI
   ============================================================ */
function montarFiltros() {
  const selUF = document.getElementById("f-uf");
  Dados.ufs.forEach((uf) => {
    const op = document.createElement("option");
    op.value = uf;
    op.textContent = `${uf} — ${UF_NOMES[uf] || uf}`;
    selUF.appendChild(op);
  });
  selUF.addEventListener("change", () => {
    const uf = selUF.value;
    document.getElementById("f-municipio").value = "";
    fecharAutocomplete();
    if (uf) {
      selecionarUF(uf);
    } else {
      Filtro.uf = "";
      mostrarBrasil();
      fecharPainel();
      montarTopOportunidades();
    }
    if (!document.getElementById("mp-lista").hidden) montarLista();
  });

  const contCanais = document.getElementById("mp-canais");
  Dados.canais.forEach(({ canal, subcanal }) => {
    Filtro.canais.add(canal); // default: todos os canais selecionados
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mp-chip-canal on";
    btn.textContent = `${canalEmoji(canal)} ${canalCurto(canal, subcanal)}`;
    btn.title = subcanal; // nome técnico completo no tooltip
    btn.dataset.canal = canal;
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => {
      const ativo = btn.classList.toggle("on");
      btn.setAttribute("aria-pressed", String(ativo));
      if (ativo) Filtro.canais.add(canal); else Filtro.canais.delete(canal);
      recalcularMapa();
    });
    contCanais.appendChild(btn);
  });

  document.getElementById("mp-tier").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-tier]");
    if (!btn) return;
    document.querySelectorAll("#mp-tier button").forEach((b) => b.classList.toggle("on", b === btn));
    Filtro.tier = btn.dataset.tier;
    recalcularMapa();
  });

  document.getElementById("mp-so-prioridade").addEventListener("change", (ev) => {
    Filtro.soPrioridadeAlta = ev.target.checked;
    if (camadaMunicipiosUF) camadaMunicipiosUF.setStyle(estiloFeature);
  });

  // Busca de cidade (autocomplete GLOBAL — não exige UF; ao escolher uma cidade,
  // a UF correspondente é selecionada automaticamente)
  const campoMuni = document.getElementById("f-municipio");
  campoMuni.addEventListener("input", () => {
    const termo = normalizarTexto(campoMuni.value);
    if (termo.length < 2) return fecharAutocomplete();
    // Busca SEMPRE nacional — a UF ativa apenas prioriza os resultados, nunca
    // esconde cidades de outros estados (o lead pode comparar regiões).
    const comeca = [], contem = [];
    Dados.porMunicipio.forEach((m, id) => {
      const nome = normalizarTexto(m.municipio);
      const item = { tipo: "municipio", chave: id, rotulo: m.municipio, uf: m.uf, prio: Filtro.uf === m.uf ? 0 : 1 };
      if (nome.startsWith(termo)) comeca.push(item);
      else if (nome.includes(termo)) contem.push(item);
    });
    comeca.sort((a, b) => a.prio - b.prio);
    contem.sort((a, b) => a.prio - b.prio);
    const candidatos = [...comeca, ...contem];
    // opção do agregado estadual ("interior de PR") quando o termo lembra isso
    Dados.agregadoPorUF.forEach((_, uf) => {
      if (normalizarTexto(`interior de ${uf} ${UF_NOMES[uf]}`).includes(termo)) {
        candidatos.push({ tipo: "uf-residual", chave: uf, rotulo: `Interior de ${uf}`, uf });
      }
    });
    renderAutocomplete(candidatos.slice(0, 12));
  });
  campoMuni.addEventListener("focus", () => campoMuni.dispatchEvent(new Event("input")));
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".mp-filtro--busca")) fecharAutocomplete();
  });

  document.getElementById("mp-toggle-lista").addEventListener("click", (ev) => {
    const ativo = ev.currentTarget.getAttribute("aria-pressed") !== "true";
    ev.currentTarget.setAttribute("aria-pressed", String(ativo));
    ev.currentTarget.textContent = ativo ? "Ver no mapa" : "Ver em lista";
    document.getElementById("mp-lista").hidden = !ativo;
    document.getElementById("mp-leaflet").hidden = ativo;
    document.getElementById("mp-legenda").hidden = ativo;
    if (ativo) montarLista();
  });
}

function renderAutocomplete(itens) {
  const box = document.getElementById("mp-autocomplete");
  box.innerHTML = "";
  if (!itens.length) {
    box.innerHTML = `<div class="mp-ac-vazio">Nenhuma cidade mapeada com esse nome. As ${TOP_N_MUNICIPIOS} maiores cidades do país aparecem individualmente; as demais estão em "Interior de [UF]".</div>`;
  } else {
    itens.forEach((it) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = it.tipo === "uf-residual"
        ? `${it.rotulo} <span class="mp-ac-uf">agregado estadual</span>`
        : `${it.rotulo} <span class="mp-ac-uf">${it.uf}</span>`;
      btn.addEventListener("click", () => {
        document.getElementById("f-municipio").value = it.rotulo;
        fecharAutocomplete();
        // selecionarMunicipio/selecionarResidualUF já sincronizam a UF e o nível do mapa
        if (it.tipo === "municipio") selecionarMunicipio(it.chave);
        else selecionarResidualUF(it.chave);
      });
      box.appendChild(btn);
    });
  }
  box.hidden = false;
}
function fecharAutocomplete() {
  const box = document.getElementById("mp-autocomplete");
  box.hidden = true;
  box.innerHTML = "";
}

function selecionarMunicipio(id) {
  const uf = ufDoCodigo(id);
  // garante o nível municipal da UF certa (e sincroniza o filtro de estado)
  if (vistaUF !== uf) selecionarUF(uf, { abrirCard: false });
  else if (Filtro.uf !== uf) { Filtro.uf = uf; document.getElementById("f-uf").value = uf; montarTopOportunidades(); }
  const isTop = Dados.topPorUF.get(uf)?.has(id);
  realceAtivo = isTop ? id : "UF:" + uf;
  if (camadaMunicipiosUF) camadaMunicipiosUF.setStyle(estiloFeature);
  const layer = layersPorId.get(id);
  if (layer) mapa.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 9 });
  abrirPainel(isTop ? "municipio" : "uf-residual", isTop ? id : uf);
}
function selecionarResidualUF(uf) {
  if (vistaUF !== uf) selecionarUF(uf, { abrirCard: false });
  realceAtivo = "UF:" + uf;
  if (camadaMunicipiosUF) camadaMunicipiosUF.setStyle(estiloFeature);
  abrirPainel("uf-residual", uf);
}

/* ============================================================
   7. LISTA (alternativa acessível ao mapa)
   ============================================================ */
function montarLista() {
  const corpo = document.getElementById("mp-lista-corpo");
  corpo.innerHTML = "";
  const linhas = [];
  Dados.porMunicipio.forEach((m, id) => {
    if (Filtro.uf && m.uf !== Filtro.uf) return;
    const agregado = valorMunicipio(id);
    if (agregado) linhas.push({ nome: m.municipio, uf: m.uf, id, ...agregado });
  });
  Dados.agregadoPorUF.forEach((_, uf) => {
    if (Filtro.uf && uf !== Filtro.uf) return;
    const agregado = valorResidualUF(uf);
    if (agregado) linhas.push({ nome: `Interior de ${uf}`, uf, id: null, ...agregado });
  });
  linhas.sort((a, b) => b.qtd - a.qtd);
  linhas.slice(0, 300).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.nome}</td><td>${l.uf}</td>
      <td>${fmtInt(l.qtd)} pts</td>
      <td><span class="mp-chip mp-chip--${l.nivel_confianca}"><i></i>${NIVEL_ROTULO[l.nivel_confianca]}</span></td>
      <td>${bandaPrioridade(l.prioridade)}</td>`;
    tr.addEventListener("click", () => {
      document.getElementById("mp-toggle-lista").click();
      if (l.id) selecionarMunicipio(l.id); else selecionarResidualUF(l.uf);
    });
    corpo.appendChild(tr);
  });
}

/* ============================================================
   8. PAINEL DE DETALHE (card de município / UF)
   ============================================================ */
let painelAtual = null; // { tipo, chave }

function abrirPainel(tipo, chave) {
  esconderDica();
  painelAtual = { tipo, chave };
  const painel = document.getElementById("mp-painel");
  const overlay = document.getElementById("mp-overlay");
  const corpo = document.getElementById("mp-painel-corpo");

  let titulo, sub, agregado, disclaimerFontes;

  if (tipo === "municipio") {
    const m = Dados.porMunicipio.get(chave);
    agregado = valorMunicipio(chave);
    titulo = m.municipio;
    sub = `${m.uf} · ${m.regiao} · fonte setorial individualizada`;
  } else if (tipo === "uf-residual") {
    agregado = valorResidualUF(chave);
    titulo = `Interior de ${UF_NOMES[chave] || chave}`;
    sub = `${UF_NOMES[chave] || chave} · soma estimada dos municípios menores do estado`;
  } else { // "uf" — visão geral do estado inteiro (todos os municípios, top + residual)
    agregado = valorEstado(chave);
    titulo = `${UF_NOMES[chave] || chave}`;
    sub = `${chave} · visão geral do estado`;
  }

  if (!agregado) {
    corpo.innerHTML = `
      <div class="mp-card-eyebrow">Sem estimativa</div>
      <h2 class="mp-card-titulo">${titulo}</h2>
      <div class="mp-card-vazio">
        Sem estimativa disponível para este recorte de canal/tier.<br />
        Tente remover algum filtro de canal ou ver o agregado do estado.
        <div><button type="button" class="botao botao--fantasma botao--pequeno" id="mp-limpar-filtros">Limpar filtros de canal</button></div>
      </div>`;
    corpo.querySelector("#mp-limpar-filtros").addEventListener("click", () => {
      document.querySelectorAll(".mp-chip-canal").forEach((b) => { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); });
      Filtro.canais = new Set(Dados.canais.map((c) => c.canal));
      Filtro.tier = "ambos";
      document.querySelectorAll("#mp-tier button").forEach((b) => b.classList.toggle("on", b.dataset.tier === "ambos"));
      recalcularMapa();
    });
  } else {
    const camadasBreakdown = [...new Map(agregado.linhas.map((r) => [r.canal + r.tier, r])).values()]
      .sort((a, b) => b.qtd_pontos_estimados - a.qtd_pontos_estimados);
    // soma por canal (juntando tiers quando "ambos")
    const porCanal = new Map();
    agregado.linhas.forEach((r) => {
      const atual = porCanal.get(r.canal) || { subcanal: r.subcanal, qtd: 0, tiers: new Set(), nominal: false };
      atual.qtd += r.qtd_pontos_estimados;
      atual.tiers.add(r.tier);
      if (linhaEhNominal(r)) atual.nominal = true;
      porCanal.set(r.canal, atual);
    });
    const linhasCanalHTML = [...porCanal.entries()]
      .sort((a, b) => b[1].qtd - a[1].qtd)
      .map(([canal, info]) => `
        <div class="mp-canal-linha">
          <span class="nome">${canalEmoji(canal)} ${canalCurto(canal, info.subcanal)}
            ${info.nominal ? '<span class="mp-badge-nominal" title="Contagem baseada no censo setorial real (lista nominal), não em estimativa demográfica">✓ censo setorial</span>' : ""}
            <small>${info.subcanal} · ${[...info.tiers].join(" + ")}</small></span>
          <span class="valor">${fmtInt(info.qtd)} pts</span>
        </div>`).join("");

    disclaimerFontes = agregado.fontes.join("; ");
    const banda = bandaPrioridade(agregado.prioridade);

    corpo.innerHTML = `
      <div class="mp-card-eyebrow">${tipo === "uf-residual" ? "Agregado estadual" : tipo === "uf" ? "Visão de estado" : "Município"}</div>
      <h2 class="mp-card-titulo">${titulo}</h2>
      <p class="mp-card-sub">${sub}</p>

      <div class="mp-card-destaques">
        <div class="d">
          <div class="n">${fmtInt(agregado.qtd)}</div>
          <div class="l">pontos com potencial de operação — universo endereçável (SAM)</div>
        </div>
        <div class="d">
          <div class="n">${fmtMoeda(agregado.faturamento / Math.max(1, agregado.qtd))}</div>
          <div class="l">faturamento médio estimado por ponto/mês (premissa: ticket × cafés/dia × dias)</div>
        </div>
      </div>

      <div class="mp-card-confianca ${agregado.nivel_confianca}">
        Confiança ${NIVEL_ROTULO[agregado.nivel_confianca]}
        <button type="button" data-abrir-drawer="confianca">o que é isso? ⓘ</button>
      </div>

      ${tipo === "uf-residual" ? `<div class="mp-card-aviso">Este valor é a soma estimada dos municípios menores do estado — não representa uma cidade específica. Os ${TOP_N_MUNICIPIOS} maiores municípios do país aparecem individualizados no mapa; os demais entram nesta linha agregada.</div>` : ""}

      <div class="mp-card-canais">${linhasCanalHTML}</div>

      <p class="mp-card-prioridade">Prioridade de expansão da rede nesta região: <span class="tag">${banda}</span></p>

      <button type="button" class="mp-card-como" data-abrir-drawer="geral">Como calculamos ⓘ</button>

      <p class="mp-card-disclaimer">
        Estimativa de potencial de mercado elaborada a partir de dados públicos setoriais
        [${disclaimerFontes}]. Não constitui levantamento de disponibilidade, reserva de
        território ou projeção de faturamento. A viabilidade de cada localização depende de
        prospecção e negociação individual com o host.
      </p>

      <button type="button" class="botao botao--grande botao--largura-total mp-cta-abrir" id="mp-cta-abrir">
        Tenho interesse nesta região →
      </button>
      <p class="mp-cta-micro">Sem compromisso — nossa equipe de expansão retorna em até 2 dias úteis.</p>
      <div id="mp-cta-container"></div>
    `;

    corpo.querySelectorAll("[data-abrir-drawer]").forEach((b) => b.addEventListener("click", () => abrirDrawer(b.dataset.abrirDrawer)));
    corpo.querySelector("#mp-cta-abrir").addEventListener("click", (ev) => {
      montarFormularioCTA(document.getElementById("mp-cta-container"), {
        titulo, uf: tipo === "municipio" ? Dados.porMunicipio.get(chave).uf : chave, agregado,
      });
      ev.currentTarget.hidden = true;
    });
  }

  painel.classList.add("aberto");
  painel.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
  montarStats();
}

function fecharPainel() {
  document.getElementById("mp-painel").classList.remove("aberto");
  document.getElementById("mp-painel").setAttribute("aria-hidden", "true");
  document.getElementById("mp-overlay").hidden = true;
  realceAtivo = null;
  if (camadaMunicipiosUF) camadaMunicipiosUF.setStyle(estiloFeature);
  painelAtual = null;
  montarStats();
}

/* ============================================================
   9. CTA — captura de lead (placeholder de integração HubSpot)
   ============================================================ */
function montarFormularioCTA(container, contexto) {
  container.innerHTML = `
    <form class="mp-cta-form" id="mp-cta-form" novalidate>
      <div class="campo">
        <label for="cta-nome">Nome</label>
        <input type="text" id="cta-nome" required minlength="3" />
        <p class="campo__erro" id="cta-erro-nome" hidden>Informe seu nome.</p>
      </div>
      <div class="campo">
        <label for="cta-email">E-mail</label>
        <input type="email" id="cta-email" required />
        <p class="campo__erro" id="cta-erro-email" hidden>Informe um e-mail válido.</p>
      </div>
      <div class="campo">
        <label for="cta-telefone">WhatsApp</label>
        <input type="tel" id="cta-telefone" inputmode="tel" placeholder="(11) 99999-9999" required />
        <p class="campo__erro" id="cta-erro-telefone" hidden>Informe um telefone válido com DDD.</p>
      </div>
      <div class="campo">
        <label for="cta-regiao">Região de interesse</label>
        <input type="text" id="cta-regiao" value="${contexto.titulo}" />
      </div>
      <div class="campo">
        <label for="cta-momento">Momento</label>
        <select id="cta-momento" required>
          <option value="">Selecione</option>
          <option value="tenho-ponto">Já tenho ponto comercial</option>
          <option value="buscando-ponto">Buscando ponto</option>
          <option value="pesquisando">Só pesquisando</option>
        </select>
      </div>
      <div class="campo">
        <label for="cta-capital">Capital disponível (opcional)</label>
        <select id="cta-capital">
          <option value="">Prefiro não informar</option>
          <option value="ate-100k">Até R$ 100 mil</option>
          <option value="100k-150k">R$ 100 mil a R$ 150 mil</option>
          <option value="150k-250k">R$ 150 mil a R$ 250 mil</option>
          <option value="acima-250k">Acima de R$ 250 mil</option>
        </select>
      </div>
      <label class="mp-cta-lgpd">
        <input type="checkbox" id="cta-lgpd" required />
        Concordo em ser contatado sobre a oportunidade Mov Coffee na minha região, conforme a
        <a href="politica-de-privacidade.html" target="_blank">Política de Privacidade</a> (LGPD).
      </label>
      <button type="submit" class="botao botao--grande botao--largura-total">Enviar</button>
    </form>
  `;

  const form = container.querySelector("#mp-cta-form");
  const telefone = form.querySelector("#cta-telefone");
  telefone.addEventListener("input", () => {
    let d = telefone.value.replace(/\D/g, "").slice(0, 11);
    if (d.length > 6) telefone.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    else if (d.length > 2) telefone.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    else if (d.length > 0) telefone.value = `(${d}`;
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    let valido = true;
    const marcar = (id, erro) => {
      form.querySelector("#" + id).classList.toggle("invalido", erro);
      form.querySelector("#cta-erro-" + id.replace("cta-", "")).hidden = !erro;
      if (erro) valido = false;
    };
    marcar("cta-nome", form.querySelector("#cta-nome").value.trim().length < 3);
    marcar("cta-email", !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.querySelector("#cta-email").value.trim()));
    marcar("cta-telefone", telefone.value.replace(/\D/g, "").length < 10);
    if (!form.querySelector("#cta-lgpd").checked || !form.querySelector("#cta-momento").value) valido = false;
    if (!valido) return;

    const dados = {
      nome: form.querySelector("#cta-nome").value.trim(),
      email: form.querySelector("#cta-email").value.trim(),
      telefone: telefone.value,
      regiao_interesse_uf: contexto.uf,
      regiao_interesse_municipio: contexto.titulo,
      canal_interesse: Filtro.canais.size === Dados.canais.length ? "todos" : [...Filtro.canais].join("|"),
      momento: form.querySelector("#cta-momento").value,
      capital: form.querySelector("#cta-capital").value,
      origem: "mapa_potencial",
      prioridade_expansao_regiao: Math.round(contexto.agregado?.prioridade || 0),
      nivel_confianca_regiao: contexto.agregado?.nivel_confianca || null,
      dataEnvio: new Date().toISOString(),
    };

    /* ============================================================
       DADO REAL NECESSÁRIO: integração com HubSpot.
       Cria/atualiza um Contact com as propriedades customizadas da
       seção 07 da spec (regiao_interesse_uf, regiao_interesse_municipio,
       canal_interesse, origem, prioridade_expansao_regiao,
       nivel_confianca_regiao). Descomente e configure o endpoint:

    try {
      const resposta = await fetch("https://SEU-ENDPOINT-HUBSPOT-AQUI.com/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error("Falha no envio: " + resposta.status);
    } catch (erro) {
      alert("Não foi possível enviar agora. Tente novamente em instantes.");
      return;
    }
    */
    console.log("Lead do mapa de potencial (aguardando integração HubSpot):", dados);

    container.innerHTML = `
      <div class="mp-cta-confirmacao">
        <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 25l7 7 13-15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p><strong>Recebido!</strong> Nossa equipe de expansão entra em contato em até 2 dias úteis.</p>
      </div>`;
  });
}

/* ============================================================
   10. DRAWER "COMO CALCULAMOS"
   ============================================================ */
function montarConteudoDrawer() {
  const corpo = document.getElementById("mp-drawer-corpo");
  const fontesHTML = Dados.canais.map(({ canal, subcanal }) => {
    const linha = Dados.linhas.find((r) => r.canal === canal);
    const marca = canalEhNominal(canal) ? ' <span class="mp-badge-nominal">✓ lista direta</span>' : "";
    return `<div class="fonte-linha"><span>${canalEmoji(canal)} ${canalCurto(canal, subcanal)}${marca}</span><span>${linha ? `${linha.fonte_dado} (${linha.ano_base})` : "—"}</span></div>`;
  }).join("");
  const canaisProxy = Dados.canais.filter(({ canal }) => !canalEhNominal(canal));
  const canaisNominais = Dados.canais.filter(({ canal }) => canalEhNominal(canal));

  corpo.innerHTML = `
    <h2 class="mp-card-titulo" style="margin-top:26px">Como calculamos</h2>

    <h3 id="drawer-secao-fontes">De onde vêm os números</h3>
    ${fontesHTML}

    <h3>Universo teórico → endereçável → priorizado</h3>
    <p><strong>Universo teórico (TAM):</strong> estimativa nacional do setor antes de qualquer
    qualificação — é contexto, não é dado por município.</p>
    <p><strong>Potencial endereçável (SAM):</strong> é o número que este mapa mostra — já
    qualificado (critério mínimo de porte/fluxo por canal) e distribuído por município.</p>
    <p><strong>Potencial priorizado:</strong> o mesmo universo endereçável, destacado pelos
    municípios/canais com maior prioridade de expansão — não é um número novo, é um recorte.</p>

    <h3 id="drawer-secao-confianca">Como funciona a confiança</h3>
    <p>A confiança sobe quando já existe operação própria em campo naquela região (captura de
    dado real). Hoje, sem nenhuma unidade Mov Coffee em operação, o teto é <strong>Médio</strong> —
    o nível <strong>Alto</strong> só passa a aparecer quando o primeiro piloto local fechar um
    ciclo completo de operação. Linhas agregadas ("Interior de UF") começam sempre um
    nível abaixo, porque a distribuição dentro do estado é menos certa que num município
    individualizado.</p>

    <h3>Como agregamos municípios menores</h3>
    <p>Os ${TOP_N_MUNICIPIOS} maiores municípios do país (por população) aparecem individualizados
    no mapa. Os demais são somados por estado, na linha "Interior de [UF]" — sem pino,
    sem nome de cidade específico.</p>

    <h3>Limitações conhecidas</h3>
    <ul>
      ${canaisNominais.length ? `<li>${canaisNominais.map(({ canal, subcanal }) => canalCurto(canal, subcanal)).join(", ")}:
      contagem baseada em <strong>censo setorial real (lista nominal)</strong> — cada unidade da
      contagem corresponde a um estabelecimento qualificado existente.</li>` : ""}
      ${canaisProxy.length ? `<li>${canaisProxy.map(({ canal, subcanal }) => canalCurto(canal, subcanal)).join(", ")}:
      potencial distribuído por população e renda do município (proxy demográfico) — não por
      lista real de endereços. Migrar para as listas nominais das fontes setoriais (ANAC, CNES,
      INEP, RAIS) está no roadmap.</li>` : ""}
      <li>Split entre tiers (premium/convencional) e coeficientes de captura são premissas da
      franqueadora, não medições diretas.</li>
    </ul>

    <p class="mp-card-disclaimer">
      Estimativa de potencial de mercado elaborada a partir de dados públicos setoriais
      [${Dados.linhas.length ? [...new Map(Dados.linhas.map((r) => [r.fonte_dado + r.ano_base, `${r.fonte_dado}, ${r.ano_base}`])).values()].join("; ") : ""}].
      Não constitui levantamento de disponibilidade, reserva de território ou projeção de
      faturamento. A viabilidade de cada localização depende de prospecção e negociação
      individual com o host.
    </p>
  `;
}

function abrirDrawer(foco) {
  document.getElementById("mp-drawer").classList.add("aberto");
  document.getElementById("mp-drawer").setAttribute("aria-hidden", "false");
  document.getElementById("mp-overlay").hidden = false;
  if (foco === "confianca") {
    document.getElementById("drawer-secao-confianca")?.scrollIntoView({ block: "start" });
  }
}
function fecharDrawer() {
  document.getElementById("mp-drawer").classList.remove("aberto");
  document.getElementById("mp-drawer").setAttribute("aria-hidden", "true");
  if (!document.getElementById("mp-painel").classList.contains("aberto")) {
    document.getElementById("mp-overlay").hidden = true;
  }
}

/* ============================================================
   11. NÚMEROS DE IMPACTO + TOP OPORTUNIDADES (comercial)
   ============================================================ */
function montarStats() {
  // Sem região selecionada: visão nacional. Com região: quebra por canal.
  // Tudo calculado do CSV — nenhum número de negócio no código.
  const el = document.getElementById("mp-stats");
  const selecao = obterSelecaoAtual();

  if (!selecao) {
    el.classList.remove("mp-stats--regiao");
    const totalPts = Dados.linhas.reduce((s, r) => s + r.qtd_pontos_estimados, 0);
    const nMunicipios = Dados.porMunicipio.size;
    const nUFs = Dados.ufs.length;
    const nCanais = Dados.canais.length;
    el.innerHTML = `
      <div class="mp-stat">
        <div class="n">${fmtInt(totalPts)}</div>
        <div class="l"><strong>pontos com potencial de operação</strong> mapeados no Brasil — universo endereçável estimado (SAM)</div>
      </div>
      <div class="mp-stat">
        <div class="n">${fmtInt(nMunicipios)}</div>
        <div class="l"><strong>maiores cidades do país</strong> individualizadas em ${nUFs} estados, mais o interior agregado de cada UF</div>
      </div>
      <div class="mp-stat">
        <div class="n">${nCanais}</div>
        <div class="l"><strong>canais de instalação</strong> — de academias e supermercados a shoppings, hospitais e aeroportos</div>
      </div>
    `;
    return;
  }

  // Quebra por canal da região selecionada: "Curitiba = 80 academias + 200 supermercados…"
  const porCanal = new Map();
  selecao.agregado.linhas.forEach((r) => {
    const atual = porCanal.get(r.canal) || { qtd: 0, subcanal: r.subcanal };
    atual.qtd += r.qtd_pontos_estimados;
    porCanal.set(r.canal, atual);
  });
  const chips = [...porCanal.entries()]
    .sort((a, b) => b[1].qtd - a[1].qtd)
    .map(([canal, info]) => `
      <span class="mp-stat-canal" title="${info.subcanal}">
        ${canalEmoji(canal)} <b>${fmtInt(info.qtd)}</b> ${canalPlural(canal, info.subcanal)}
      </span>`).join('<span class="mp-stat-mais">+</span>');

  el.classList.add("mp-stats--regiao");
  el.innerHTML = `
    <div class="mp-stat mp-stat--regiao">
      <div class="mp-stat-regiao-head">
        <span class="nome">${selecao.titulo}</span>
        <span class="total"><b>${fmtInt(selecao.agregado.qtd)}</b> pontos potenciais no total</span>
      </div>
      <div class="mp-stat-canais">${chips}</div>
    </div>
  `;
}

// Região atualmente selecionada (para o painel superior) — null se nada selecionado
function obterSelecaoAtual() {
  if (!painelAtual) return null;
  const { tipo, chave } = painelAtual;
  if (tipo === "municipio") {
    const m = Dados.porMunicipio.get(chave);
    const agregado = valorMunicipio(chave);
    return agregado ? { titulo: `${m.municipio} · ${m.uf}`, agregado } : null;
  }
  if (tipo === "uf-residual") {
    const agregado = valorResidualUF(chave);
    return agregado ? { titulo: `Interior de ${UF_NOMES[chave] || chave}`, agregado } : null;
  }
  // tipo "uf": estado inteiro
  const agregado = valorEstado(chave);
  return agregado ? { titulo: UF_NOMES[chave] || chave, agregado } : null;
}

function montarTopOportunidades() {
  const cont = document.getElementById("mp-top");
  const titulo = document.getElementById("mp-top-titulo");
  titulo.textContent = Filtro.uf
    ? `Maiores oportunidades em ${UF_NOMES[Filtro.uf] || Filtro.uf}`
    : "Maiores oportunidades mapeadas";

  const itens = [];
  Dados.porMunicipio.forEach((m, id) => {
    if (Filtro.uf && m.uf !== Filtro.uf) return;
    const agregado = valorMunicipio(id);
    if (agregado) itens.push({ id, m, agregado });
  });
  itens.sort((a, b) => b.agregado.qtd - a.agregado.qtd);

  cont.innerHTML = "";
  if (!itens.length) {
    cont.innerHTML = '<div class="mp-top-vazio">Sem estimativa para este recorte — ajuste os filtros de canal/tier.</div>';
    return;
  }
  itens.slice(0, 6).forEach((it, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mp-top-card";
    btn.innerHTML = `
      <span class="rank">#${idx + 1}</span>
      <div class="nome">${it.m.municipio}</div>
      <div class="uf">${it.m.uf} · ${it.m.regiao}</div>
      <div class="pts">${fmtInt(it.agregado.qtd)} <small>pontos potenciais</small></div>
      <div class="meta">
        <span class="mp-chip mp-chip--${it.agregado.nivel_confianca}"><i></i>${NIVEL_ROTULO[it.agregado.nivel_confianca]}</span>
        <span class="banda">Prioridade ${bandaPrioridade(it.agregado.prioridade)}</span>
      </div>`;
    btn.addEventListener("click", () => selecionarMunicipio(it.id));
    cont.appendChild(btn);
  });
}

function esconderDica() {
  const dica = document.getElementById("mp-dica");
  if (dica) dica.remove();
}

/* ============================================================
   12. FUNIL TAM -> SAM -> PRIORIZADO (contexto estático)
   ============================================================ */
function montarFunil() {
  document.getElementById("mp-funil").innerHTML = `
    <div class="f"><div class="k">Camada 1</div><h4>Universo teórico (TAM)</h4>
      <p>Estimativa nacional por canal, antes de qualquer qualificação. Não existe por
      município — é contexto, disponível em "Como calculamos".</p></div>
    <div class="f"><div class="k">Camada 2</div><h4>Universo endereçável (SAM)</h4>
      <p>É o que o mapa plota: potencial já qualificado e distribuído por município. Métrica
      padrão da cor do coroplético.</p></div>
    <div class="f"><div class="k">Camada 3</div><h4>Potencial priorizado</h4>
      <p>O mesmo universo endereçável, destacado por prioridade de expansão — use "destacar só
      prioridade alta" na legenda.</p></div>
  `;
}

/* ============================================================
   13. BOOTSTRAP
   ============================================================ */
async function iniciar() {
  document.getElementById("mp-painel-fechar").addEventListener("click", fecharPainel);
  document.getElementById("mp-drawer-fechar").addEventListener("click", fecharDrawer);
  document.getElementById("mp-overlay").addEventListener("click", () => { fecharPainel(); fecharDrawer(); });
  document.getElementById("btn-como-calculamos").addEventListener("click", () => abrirDrawer("geral"));

  // arraste simples do bottom sheet no mobile (fecha se soltar abaixo da metade)
  const painel = document.getElementById("mp-painel");
  const alca = document.getElementById("mp-painel-arraste");
  let arrasteInicioY = null;
  alca.addEventListener("touchstart", (e) => (arrasteInicioY = e.touches[0].clientY), { passive: true });
  alca.addEventListener("touchmove", (e) => {
    if (arrasteInicioY === null) return;
    const delta = e.touches[0].clientY - arrasteInicioY;
    if (delta > 0) painel.style.transform = `translateY(${delta}px)`;
  }, { passive: true });
  alca.addEventListener("touchend", (e) => {
    const delta = (e.changedTouches[0].clientY - arrasteInicioY) || 0;
    painel.style.transform = "";
    if (delta > 120) fecharPainel();
    arrasteInicioY = null;
  });

  try {
    await carregarDados();
  } catch (erro) {
    document.getElementById("mp-loading").innerHTML =
      `<p>Não foi possível carregar os dados do mapa (${erro.message}). Verifique se ` +
      `<code>data/base_pontos.csv</code> e <code>data/malha-municipios-br.json</code> existem.</p>`;
    return;
  }

  montarFiltros();
  montarStats();
  montarFunil();
  atualizarFontesRodape();
  iniciarMapa();
  recalcularMapa();
  montarConteudoDrawer();

  document.getElementById("mp-loading").hidden = true;
  document.getElementById("mp-leaflet").hidden = false;
}

document.addEventListener("DOMContentLoaded", iniciar);

#!/usr/bin/env node
/* ============================================================
   Pipeline fase 3 — canal SHOPPING por LISTA NOMINAL
   ------------------------------------------------------------
   Substitui, em data/base_pontos.csv, as linhas do canal `shopping`
   (hoje distribuídas por proxy demográfico) por contagens reais vindas
   de um censo nominal de shoppings (data/fontes/shoppings.csv).

   O que faz, na ordem:
     1. Lê e VALIDA a lista nominal (código IBGE coerente com a UF,
        ABL numérica > 0, sem duplicatas) — falha com erro explícito.
     2. Qualifica (ABL >= qualificacao.abl_min_m2) e divide em tiers
        (premium se ABL >= tiers.premium_abl_min_m2).
     3. Agrega por município × tier. Municípios que NÃO são
        individualizados na base (fora do top-100) somam na linha
        "Interior de [UF]" — mesma regra da fase 2.
     4. Remove as linhas antigas de shopping da base e insere as novas,
        reaproveitando ticket/fluxo/faturamento-por-ponto/fonte/confiança
        das linhas antigas (por tier e por nível de agregação).
     5. Recalcula prioridade_expansao de TODA a base (mesma fórmula da
        fase 2: qtd × ticket × peso_tier, normalizado 1..100).
     6. Regrava o CSV e imprime um log de validação.

   Nenhum número de negócio hardcoded: tudo em params-shoppings.json.
   Uso:  node pipeline-shoppings.js
         node pipeline-shoppings.js --fontes ../fontes/shoppings.csv \
              --base ../base_pontos.csv --params params-shoppings.json
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function arg(nome, padrao) {
  const i = args.indexOf("--" + nome);
  return i >= 0 ? args[i + 1] : padrao;
}
const DIR = __dirname;
const FONTES = path.resolve(DIR, arg("fontes", "../fontes/shoppings.csv"));
const BASE = path.resolve(DIR, arg("base", "../base_pontos.csv"));
const PARAMS = path.resolve(DIR, arg("params", "params-shoppings.json"));

const UF_PREFIXO = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};

function falhar(msg) {
  console.error("\n[ERRO] " + msg + "\n");
  process.exit(2);
}

function lerCSV(caminho) {
  if (!fs.existsSync(caminho)) falhar("Arquivo não encontrado: " + caminho);
  const texto = fs.readFileSync(caminho, "utf8").trim();
  if (texto.includes('"')) falhar(`${path.basename(caminho)} contém aspas — este pipeline usa CSV simples (sem vírgulas nos campos).`);
  const linhas = texto.split(/\r?\n/);
  const cab = linhas[0].split(",").map((c) => c.trim());
  const registros = linhas.slice(1).map((l, idx) => {
    const cols = l.split(",");
    if (cols.length !== cab.length) falhar(`${path.basename(caminho)} linha ${idx + 2}: ${cols.length} colunas (esperado ${cab.length}).`);
    const o = {};
    cab.forEach((c, i) => (o[c] = cols[i].trim()));
    return o;
  });
  return { cab, registros };
}

/* ---------- 1. lista nominal: carga + validação ---------- */
const params = JSON.parse(fs.readFileSync(PARAMS, "utf8"));
const { registros: shoppings } = lerCSV(FONTES);

const obrigatorias = ["id", "nome", "uf", "municipio", "codigo_ibge", "abl_m2"];
const faltando = obrigatorias.filter((c) => !(c in (shoppings[0] || {})));
if (faltando.length) falhar("Colunas ausentes em shoppings.csv: " + faltando.join(", "));

const erros = [];
const idsVistos = new Set();
shoppings.forEach((s, i) => {
  const linha = i + 2;
  if (idsVistos.has(s.id)) erros.push(`linha ${linha}: id duplicado (${s.id})`);
  idsVistos.add(s.id);
  if (!UF_PREFIXO[s.uf]) erros.push(`linha ${linha}: UF inválida (${s.uf})`);
  else if (!/^\d{7}$/.test(s.codigo_ibge)) erros.push(`linha ${linha}: codigo_ibge sem 7 dígitos (${s.codigo_ibge})`);
  else if (s.codigo_ibge.slice(0, 2) !== UF_PREFIXO[s.uf]) erros.push(`linha ${linha}: codigo_ibge ${s.codigo_ibge} não corresponde à UF ${s.uf}`);
  const abl = Number(s.abl_m2);
  if (!Number.isFinite(abl) || abl <= 0) erros.push(`linha ${linha}: abl_m2 inválida (${s.abl_m2})`);
});
if (erros.length) falhar("Lista nominal reprovada na validação:\n  - " + erros.slice(0, 12).join("\n  - "));

/* ---------- 2. qualificação + tier ---------- */
const ablMin = params.qualificacao.abl_min_m2;
const ablPremium = params.tiers.premium_abl_min_m2;
const qualificados = shoppings.filter((s) => Number(s.abl_m2) >= ablMin);
qualificados.forEach((s) => (s.tier = Number(s.abl_m2) >= ablPremium ? "premium" : "convencional"));

/* ---------- 3. base atual: templates + agregação ---------- */
const { cab: cabBase, registros: base } = lerCSV(BASE);
const shoppingAntigas = base.filter((r) => r.canal === "shopping");
const demais = base.filter((r) => r.canal !== "shopping");
if (!shoppingAntigas.length) falhar("A base não tem linhas do canal shopping para usar como template.");

const AGREGADO_RE = /^(Demais municípios|Interior de)/i;
// template por tier × nível (individual/agregado): ticket, fluxo, R$/ponto, fonte, confiança
function acharTemplate(tier, agregado) {
  const t = shoppingAntigas.find((r) => r.tier === tier && AGREGADO_RE.test(r.municipio) === agregado)
    || shoppingAntigas.find((r) => r.tier === tier);
  if (!t) falhar(`Sem linha-template de shopping para o tier ${tier}.`);
  return t;
}
function fatPorPonto(tpl) {
  const q = Number(tpl.qtd_pontos_estimados), f = Number(tpl.faturamento_mensal_estimado);
  if (!q || !f) falhar("Template de shopping com qtd/faturamento zerados — base corrompida?");
  return f / q;
}

// municípios individualizados na base (qualquer canal) e nomes/regiões conhecidos
const topCodes = new Set(base.filter((r) => r.codigo_ibge).map((r) => r.codigo_ibge));
const regiaoPorUF = new Map(base.map((r) => [r.uf, r.regiao]));

// agrega censo: município individualizado → linha própria; resto → interior da UF
const porMunicipio = new Map(); // codigo -> {uf, municipio, premium, convencional}
const interior = new Map();     // uf -> {premium, convencional}
let foraDaMalhaDaBase = 0;
qualificados.forEach((s) => {
  if (topCodes.has(s.codigo_ibge)) {
    const m = porMunicipio.get(s.codigo_ibge) || { uf: s.uf, municipio: s.municipio, premium: 0, convencional: 0 };
    m[s.tier]++;
    porMunicipio.set(s.codigo_ibge, m);
  } else {
    const agg = interior.get(s.uf) || { premium: 0, convencional: 0 };
    agg[s.tier]++;
    interior.set(s.uf, agg);
    foraDaMalhaDaBase++;
  }
  if (!regiaoPorUF.has(s.uf)) falhar(`UF ${s.uf} do censo não existe na base — gere a base dessa UF primeiro.`);
});

/* ---------- 4. novas linhas de shopping ---------- */
const metodologia = params.metodologia_rotulo
  .replace("{abl_min}", String(ablMin))
  .replace("{abl_premium}", String(ablPremium));

const novas = [];
function novaLinha(uf, municipio, codigo, tier, qtd, agregada) {
  if (!qtd) return;
  const tpl = acharTemplate(tier, agregada);
  novas.push({
    ...tpl,
    uf,
    municipio,
    codigo_ibge: codigo,
    regiao: regiaoPorUF.get(uf),
    tier,
    qtd_pontos_estimados: String(qtd),
    faturamento_mensal_estimado: (qtd * fatPorPonto(tpl)).toFixed(2),
    metodologia_aplicada: metodologia,
  });
}
porMunicipio.forEach((m, codigo) => {
  novaLinha(m.uf, m.municipio, codigo, "premium", m.premium, false);
  novaLinha(m.uf, m.municipio, codigo, "convencional", m.convencional, false);
});
interior.forEach((agg, uf) => {
  novaLinha(uf, `Interior de ${uf}`, "", "premium", agg.premium, true);
  novaLinha(uf, `Interior de ${uf}`, "", "convencional", agg.convencional, true);
});

/* ---------- 5. recalcula prioridade_expansao da base inteira ---------- */
const todas = [...demais, ...novas];
const peso = params.prioridade.peso_tier;
const scores = todas.map((r) => Number(r.qtd_pontos_estimados) * Number(r.ticket_medio_estimado) * (peso[r.tier] ?? 1));
const lo = Math.min(...scores), hi = Math.max(...scores);
const { escala_min: eMin, escala_max: eMax } = params.prioridade;
todas.forEach((r, i) => {
  r.prioridade_expansao = String(hi > lo ? Math.round(eMin + ((scores[i] - lo) * (eMax - eMin)) / (hi - lo)) : eMax);
});

// mesma ordenação da fase 2: prioridade desc, canal, uf, municipio, tier — e id sequencial
todas.sort((a, b) =>
  Number(b.prioridade_expansao) - Number(a.prioridade_expansao) ||
  a.canal.localeCompare(b.canal) || a.uf.localeCompare(b.uf) ||
  a.municipio.localeCompare(b.municipio) || a.tier.localeCompare(b.tier));
todas.forEach((r, i) => (r.id = String(i + 1)));

/* ---------- 6. grava + log ---------- */
const saida = [cabBase.join(",")].concat(todas.map((r) => cabBase.map((c) => r[c] ?? "").join(",")));
fs.writeFileSync(BASE, saida.join("\n") + "\n", "utf8");

const totalNovo = novas.reduce((s, r) => s + Number(r.qtd_pontos_estimados), 0);
const totalAntigo = shoppingAntigas.reduce((s, r) => s + Number(r.qtd_pontos_estimados), 0);
console.log("=".repeat(60));
console.log("PIPELINE SHOPPINGS — lista nominal");
console.log("=".repeat(60));
console.log(`Censo bruto:            ${shoppings.length} shoppings`);
console.log(`Qualificados (ABL>=${ablMin}): ${qualificados.length}`);
console.log(`  premium (ABL>=${ablPremium}): ${qualificados.filter((s) => s.tier === "premium").length}`);
console.log(`  convencional:          ${qualificados.filter((s) => s.tier === "convencional").length}`);
console.log(`Municípios individualizados: ${porMunicipio.size}`);
console.log(`No interior (agregado por UF): ${foraDaMalhaDaBase} shoppings em ${interior.size} UFs`);
console.log(`Pontos shopping na base: ${totalAntigo} (proxy) -> ${totalNovo} (nominal)`);
console.log(`Linhas da base: ${base.length} -> ${todas.length}`);
console.log("[ok] base regravada em " + BASE);

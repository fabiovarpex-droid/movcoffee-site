/* ============================================================
   Mov Coffee — Simulador de Plano de Negócio
   Motor determinístico + interface. Port fiel do protótipo validado.

   Sem rampa de maturação: volume pleno desde o mês 1.
   Payback = investimento ÷ lucro líquido mensal.

   Os valores-padrão dos sliders são as premissas de referência da rede
   (jul/2026). Para reprecificar em um só lugar, ajuste o objeto DEFAULTS
   e os atributos value= no HTML.
   ============================================================ */

"use strict";

(function () {
  const raiz = document.querySelector(".simulador");
  if (!raiz) return; // só roda na página do simulador

  /* ============ Formatação PT-BR ============ */
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const BRL2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  const el = (id) => document.getElementById(id);
  const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     PERFIS DE PONTO — fonte única de calibragem da rede
     ------------------------------------------------------------
     O perfil é um "cenário-base": ao trocar, sobrescreve ticket
     (valor + faixa do slider), cafés/dia e o bloco de CMV (blend).
     O CMV é função do PERFIL (blend abastecido no ponto), NÃO do
     ticket — mover o slider de ticket não altera o custo do insumo.

     A franqueadora recalibra a rede editando SÓ este objeto, sem
     tocar na lógica de cálculo.
     ============================================================ */
  const PERFIS = {
    premium: {
      label: "Premium",
      pontos: "Shopping · Aeroporto · Academia",
      ticket: { default: 12, min: 9, max: 18 },
      coposDia: { default: 40 },
      // Blend specialty (grão torrado ~R$85/kg)
      cmv: { cafe: 0.90, leite: 0.45, descartaveis: 0.30, outros: 0.15 },
      mixNota:
        "~15% do ticket, ponderado pelo mix (37,5% expresso / 62,5% bebidas de R$15). Grão torrado ~R$85/kg; leite ~R$6,50/L.",
      premissaExtra: "",
    },
    altoGiro: {
      label: "Alto Giro",
      pontos: "Supermercado · Terminais · Interior",
      ticket: { default: 7.5, min: 6, max: 9 },
      coposDia: { default: 60 },
      // ⚠️ CONFIRMAR: cmv.cafe = 0,54 é PREMISSA DE SOURCING (blend tradicional
      // arábica+conilon comprado TORRADO direto de cooperativa/torrefação, private
      // label). Estratégia definida; sourcing ainda não contratado. Se a cotação real
      // vier diferente, ajustar APENAS este valor — nada mais depende dele.
      cmv: { cafe: 0.54, leite: 0.45, descartaveis: 0.30, outros: 0.15 },
      mixNota:
        "~19% do ticket · mix puxado para café preto e bebidas P, com blend tradicional mais barato.",
      premissaExtra:
        "Blend tradicional fornecido pela rede — custo de insumo menor pareado ao ticket do ponto.",
    },
  };

  // Premissas comuns aos dois perfis (não mudam com o perfil).
  const COMUNS = {
    royalties: 800, energia: 200, conectividade: 70, manutencao: 150,
    contabilidade: 400, seguroHigiene: 160, aliquotaImposto: 6, taxaPagamento: 2.5,
    ocupacaoDefault: 1500, capex: { default: 72000, min: 69000, max: 75000 },
  };

  /* ============ Estado da interface ============ */
  let perfil = "premium"; // 'premium' | 'altoGiro'
  let cmvMode = "det";    // 'det' (detalhado) | 'simp' (% simples)
  let laborMode = "self"; // 'self' (licenciado) | 'hire' (colaborador)
  let horizonte = 36;     // meses no gráfico (12 | 36 | 60)

  /* ============ Leitura dos inputs ============ */
  function readInputs() {
    return {
      capex: +el("capex").value, unid: +el("unid").value,
      ticket: +el("ticket").value, copos: +el("copos").value, dias: +el("dias").value,
      cafe: +el("cafe").value, leite: +el("leite").value, desc: +el("desc").value, outros: +el("outros").value,
      cmvpct: +el("cmvpct").value,
      ocup: +el("ocup").value, roy: 800,
      ener: +el("ener").value, conec: +el("conec").value, manut: +el("manut").value,
      cont: +el("cont").value, seg: +el("seg").value,
      mo: laborMode === "hire" ? +el("mo").value : 0,
      imp: +el("imp").value, tax: +el("tax").value,
    };
  }

  function cmvPorCopo(i) {
    if (cmvMode === "simp") return i.ticket * (i.cmvpct / 100);
    return i.cafe + i.leite + i.desc + i.outros;
  }
  function custosFixosUnidade(i) {
    return i.ocup + i.roy + i.ener + i.conec + i.manut + i.cont + i.seg + i.mo;
  }

  // Regime pleno (rede inteira) para um dado nº de cafés/dia.
  function regime(i, coposDia) {
    const coposMes = coposDia * i.dias;
    const receita = coposMes * i.ticket * i.unid;
    const cmv = coposMes * cmvPorCopo(i) * i.unid;
    const impostos = receita * (i.imp / 100);
    const pagamento = receita * (i.tax / 100);
    const mc = receita - cmv - impostos - pagamento;
    const fixos = custosFixosUnidade(i) * i.unid;
    const lucro = mc - fixos;
    return { coposMes, receita, cmv, impostos, pagamento, mc, fixos, lucro };
  }

  // Payback SEM rampa: investimento ÷ lucro mensal (por unidade = rede).
  function payback(i, coposDia) {
    const rUnidade = regime({ ...i, unid: 1 }, coposDia);
    if (rUnidade.lucro <= 0) return null;
    return i.capex / rUnidade.lucro;
  }

  // Break-even em cafés/dia (por unidade).
  function breakeven(i) {
    const mcCopo = i.ticket - cmvPorCopo(i) - i.ticket * (i.imp / 100) - i.ticket * (i.tax / 100);
    if (mcCopo <= 0) return { viavel: false };
    return { viavel: true, coposDia: custosFixosUnidade(i) / mcCopo / i.dias };
  }

  /* ============ Animação count-up ============
     O valor FINAL é sempre garantido, mesmo que o requestAnimationFrame seja
     pausado, e uma animação superada nunca sobrescreve um valor mais recente. */
  function animateNum(node, to, fmt) {
    const gen = (node._animGen = (node._animGen || 0) + 1);
    const from = parseFloat(node.dataset.raw || to) || 0;
    node.dataset.raw = to;
    if (reduzMovimento || from === to) { node.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 380;
    let done = false;
    const finalize = () => { if (!done && node._animGen === gen) { done = true; node.textContent = fmt(to); } };
    function step(t) {
      if (node._animGen !== gen) return;
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else finalize();
    }
    requestAnimationFrame(step);
    setTimeout(finalize, dur + 120);
  }
  function setNumText(node, text) {
    node._animGen = (node._animGen || 0) + 1;
    node.dataset.raw = 0;
    node.textContent = text;
  }

  /* ============ Gráfico de fluxo de caixa acumulado ============ */
  function drawChart(i) {
    const svg = el("sim-chart");
    const W = 400, H = 190, padL = 6, padR = 6, padT = 12, padB = 18;
    const r = regime(i, i.copos);
    const capexRede = i.capex * i.unid;

    const pts = [{ m: 0, acum: -capexRede }];
    for (let m = 1; m <= horizonte; m++) pts.push({ m, acum: -capexRede + r.lucro * m });

    const ys = pts.map((p) => p.acum);
    let min = Math.min(...ys, 0), max = Math.max(...ys, 0);
    if (max === min) max = min + 1;
    const xw = W - padL - padR, yh = H - padT - padB;
    const X = (m) => padL + (m / horizonte) * xw;
    const Y = (v) => padT + (1 - (v - min) / (max - min)) * yh;
    const zeroY = Y(0);

    const poly = pts.map((p) => `${X(p.m).toFixed(1)},${Y(p.acum).toFixed(1)}`).join(" ");
    const area = `${padL},${zeroY.toFixed(1)} ${poly} ${X(horizonte).toFixed(1)},${zeroY.toFixed(1)}`;

    const pb = payback(i, i.copos);
    let pbMark = "";
    if (pb !== null && pb <= horizonte) {
      const px = X(pb), py = zeroY;
      pbMark =
        `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="#FF7A3D" stroke="#0e0f0d" stroke-width="2"/>` +
        `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="none" stroke="#FF7A3D" stroke-opacity=".4"/>`;
    }
    svg.innerHTML =
      `<defs><linearGradient id="sim-ag" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#FF7A3D" stop-opacity=".28"/>` +
      `<stop offset="100%" stop-color="#FF7A3D" stop-opacity="0"/></linearGradient></defs>` +
      `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 4" stroke-width="1"/>` +
      `<polygon points="${area}" fill="url(#sim-ag)"/>` +
      `<polyline points="${poly}" fill="none" stroke="#FF7A3D" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` +
      pbMark;
  }

  /* ============ DRE mensal (rede inteira) ============ */
  function renderDRE(r) {
    const pct = (v) => (r.receita ? `<span class="sim-dre-pct">${(v / r.receita * 100).toFixed(0)}%</span>` : "");
    el("sim-dre").innerHTML =
      `<div class="sim-dre-row"><span class="l">Receita bruta</span><span class="v">${BRL.format(r.receita)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Impostos</span><span class="v">-${BRL.format(r.impostos)}${pct(r.impostos)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Taxa de pagamento</span><span class="v">-${BRL.format(r.pagamento)}${pct(r.pagamento)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) CMV (insumos)</span><span class="v">-${BRL.format(r.cmv)}${pct(r.cmv)}</span></div>` +
      `<div class="sim-dre-row total"><span class="l">Margem de contribuição</span><span class="v">${BRL.format(r.mc)}${pct(r.mc)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Custos fixos</span><span class="v">-${BRL.format(r.fixos)}${pct(r.fixos)}</span></div>` +
      `<div class="sim-dre-row result total"><span class="l">Lucro líquido</span><span class="v ${r.lucro < 0 ? "neg" : ""}">${BRL.format(r.lucro)}${pct(r.lucro)}</span></div>`;
  }

  /* ============ Cenários ============ */
  function renderScen(i) {
    const linhas = [["Conserv.", 0.7], ["Realista", 1.0], ["Otim.", 1.3]];
    const dados = linhas.map(([n, mult]) => {
      const coposDia = i.copos * mult;
      const r = regime(i, coposDia);
      return { n, lucro: r.lucro, margem: r.receita ? r.lucro / r.receita : 0, pb: payback(i, coposDia) };
    });
    const fmtPb = (pb) => (pb === null ? "—" : pb.toFixed(1).replace(".", ",") + " m");
    el("sim-scen").innerHTML =
      `<tr><td>Lucro/mês</td>${dados.map((d) => `<td>${BRL.format(d.lucro)}</td>`).join("")}</tr>` +
      `<tr><td>Margem líq.</td>${dados.map((d) => `<td>${(d.margem * 100).toFixed(0)}%</td>`).join("")}</tr>` +
      `<tr><td>Payback</td>${dados.map((d) => `<td>${fmtPb(d.pb)}</td>`).join("")}</tr>`;
  }

  /* ============ Preenchimento do slider (barra laranja) ============ */
  function updateSliderFill(input) {
    const min = +input.min, max = +input.max, val = +input.value;
    input.style.setProperty("--pct", (max > min ? ((val - min) / (max - min)) * 100 : 50) + "%");
  }

  /* ============ Aplicação do perfil de ponto ============
     Sobrescreve ticket (valor + faixa), cafés/dia e o bloco de CMV com o
     preset do perfil. Ocupação, dias, nº de quiosques e operação são
     preservados (o usuário pode tê-los ajustado). */
  function aplicarPerfil(novo, primeira) {
    perfil = novo;
    const p = PERFIS[perfil];

    // ticket: faixa antes do valor (para não clampar)
    const inpTicket = el("ticket");
    inpTicket.min = p.ticket.min;
    inpTicket.max = p.ticket.max;
    inpTicket.value = p.ticket.default;

    // cafés/dia (faixa inalterada; só o default do perfil)
    el("copos").value = p.coposDia.default;

    // CMV detalhado (blend do perfil)
    el("cafe").value = p.cmv.cafe;
    el("leite").value = p.cmv.leite;
    el("desc").value = p.cmv.descartaveis;
    el("outros").value = p.cmv.outros;

    // CMV % simples: equivalente coerente do blend sobre o ticket-base do perfil
    const totalCmv = p.cmv.cafe + p.cmv.leite + p.cmv.descartaveis + p.cmv.outros;
    el("cmvpct").value = (totalCmv / p.ticket.default * 100).toFixed(1);

    // estado visual + acessível dos botões
    const bP = el("perfil-premium"), bA = el("perfil-altogiro");
    bP.classList.toggle("on", perfil === "premium");
    bA.classList.toggle("on", perfil === "altoGiro");
    bP.setAttribute("aria-pressed", String(perfil === "premium"));
    bA.setAttribute("aria-pressed", String(perfil === "altoGiro"));

    // expõe o perfil para o formulário de lead (script.js) — premium | alto_giro
    raiz.dataset.perfil = perfil === "altoGiro" ? "alto_giro" : "premium";

    renderPremissas();
    if (!primeira) render();
  }

  /* ============ Painel read-only "Premissas da rede" ============ */
  function renderPremissas() {
    const p = PERFIS[perfil];
    const tituloEl = el("premissas-titulo");
    if (tituloEl) tituloEl.textContent = `Premissas da rede — perfil ${p.label}`;
    const corpo = el("premissas-corpo");
    if (!corpo) return;
    const totalCmv = p.cmv.cafe + p.cmv.leite + p.cmv.descartaveis + p.cmv.outros;
    const linha = (l, v) => `<div class="sim-prem-row"><span>${l}</span><span>${v}</span></div>`;
    corpo.innerHTML =
      linha("Pontos-alvo", p.pontos) +
      linha("Ticket médio (base)", BRL2.format(p.ticket.default) + ` · faixa ${BRL.format(p.ticket.min)}–${BRL.format(p.ticket.max)}`) +
      linha("Cafés/dia (base)", String(p.coposDia.default)) +
      linha("CMV por café", BRL2.format(totalCmv) + ` (café ${BRL2.format(p.cmv.cafe)} · leite ${BRL2.format(p.cmv.leite)} · descart. ${BRL2.format(p.cmv.descartaveis)} · outros ${BRL2.format(p.cmv.outros)})`) +
      linha("Royalties", BRL.format(COMUNS.royalties) + " / mês") +
      linha("Impostos (Simples)", COMUNS.aliquotaImposto.toFixed(1).replace(".", ",") + "%") +
      linha("Taxa de pagamento", COMUNS.taxaPagamento.toFixed(1).replace(".", ",") + "%") +
      linha("Ocupação (base)", BRL.format(COMUNS.ocupacaoDefault) + " / mês") +
      linha("Investimento", BRL.format(COMUNS.capex.default) + ` · faixa ${BRL.format(COMUNS.capex.min)}–${BRL.format(COMUNS.capex.max)}`) +
      (p.premissaExtra ? `<p class="sim-prem-nota">${p.premissaExtra}</p>` : "");
  }

  /* ============ Render principal ============ */
  function render() {
    const i = readInputs();

    // rótulos
    // Investimento exibido é o TOTAL da rede: valor por quiosque × nº de quiosques
    // (ex.: 1 quiosque = R$ 72.000 · 2 quiosques = R$ 144.000)
    el("v-capex").textContent = BRL.format(i.capex * i.unid);
    const capexHint = el("capex-hint");
    if (i.unid > 1) {
      capexHint.style.display = "block";
      capexHint.innerHTML = `${BRL.format(i.capex)} por quiosque × <strong>${i.unid} quiosques</strong> = ${BRL.format(i.capex * i.unid)}`;
    } else {
      capexHint.style.display = "none";
    }
    el("v-unid").textContent = i.unid;
    // Ticket pode ter passo de R$ 0,50 — mostra centavos só quando não é inteiro
    el("v-ticket").textContent = (i.ticket % 1 === 0) ? BRL.format(i.ticket) : BRL2.format(i.ticket);
    el("v-copos").textContent = i.copos;
    el("v-dias").textContent = i.dias;
    el("v-cafe").textContent = BRL2.format(i.cafe);
    el("v-leite").textContent = BRL2.format(i.leite);
    el("v-desc").textContent = BRL2.format(i.desc);
    el("v-outros").textContent = BRL2.format(i.outros);
    el("v-cmvcopo").textContent = BRL2.format(cmvPorCopo(i));
    el("v-cmvpct").textContent = i.cmvpct.toFixed(1).replace(".", ",") + "%";
    el("v-ocup").textContent = BRL.format(i.ocup);
    el("v-roy").textContent = BRL.format(800);
    el("v-ener").textContent = BRL.format(i.ener);
    el("v-conec").textContent = BRL.format(i.conec);
    el("v-manut").textContent = BRL.format(i.manut);
    el("v-cont").textContent = BRL.format(i.cont);
    el("v-seg").textContent = BRL.format(i.seg);
    el("v-mo").textContent = BRL.format(+el("mo").value);
    el("v-imp").textContent = i.imp.toFixed(1).replace(".", ",") + "%";
    el("v-tax").textContent = i.tax.toFixed(1).replace(".", ",") + "%";

    document.querySelectorAll(".simulador input[type=range]").forEach(updateSliderFill);

    // cálculos
    const r = regime(i, i.copos);
    const pb = payback(i, i.copos);
    const be = breakeven(i);

    // HERÓI
    const pbNode = el("r-payback"), pbU = el("r-payback-u");
    if (pb === null) { setNumText(pbNode, "—"); pbU.textContent = "não atinge retorno"; }
    else { animateNum(pbNode, pb, (v) => v.toFixed(1).replace(".", ",")); pbU.textContent = "meses"; }

    const lucroNode = el("r-lucro");
    lucroNode.classList.toggle("neg", r.lucro < 0);
    animateNum(lucroNode, r.lucro, (v) => BRL.format(v));

    el("r-margem").textContent = (r.receita ? r.lucro / r.receita * 100 : 0).toFixed(0) + "%";
    const beCopos = be.viavel ? Math.ceil(be.coposDia) : null;
    el("r-be").textContent = beCopos !== null ? beCopos : "—";
    el("r-receita").textContent = "R$ " + (r.receita / 1000).toFixed(1).replace(".", ",") + "k";

    // nota do mix/blend do perfil ativo (mantém o CMV honesto por perfil)
    const notaEl = el("cmv-mixnota");
    if (notaEl) notaEl.textContent = PERFIS[perfil].mixNota;

    // Aviso de honestidade comercial: Alto Giro + colaborador exige fluxo alto.
    // Usa o MESMO valor exibido no KPI de break-even (Math.ceil) para não divergir.
    const aviso = el("be-aviso");
    if (aviso) {
      const mostrar = perfil === "altoGiro" && laborMode === "hire" && beCopos !== null;
      aviso.hidden = !mostrar;
      if (mostrar) {
        aviso.innerHTML =
          `No perfil <strong>Alto Giro</strong> com colaborador, o ponto exige fluxo alto ` +
          `(break-even ≈ <strong>${beCopos} cafés/dia</strong>). A seleção do ponto é o fator nº 1 do resultado.`;
      }
    }

    renderDRE(r);
    renderScen(i);
    drawChart(i);

    const cap = el("sim-chart-cap");
    if (pb === null) cap.textContent = "Neste cenário o investimento não é recuperado no horizonte simulado.";
    else if (pb > horizonte) cap.textContent = `Retorno em ~${pb.toFixed(1).replace(".", ",")} meses (fora do horizonte de ${horizonte}m exibido).`;
    else cap.textContent = `O caixa cruza o zero (retorno do investimento) em ~${pb.toFixed(1).replace(".", ",")} meses.`;
  }

  /* ============ Listeners ============ */
  document.querySelectorAll(".simulador input[type=range]").forEach((inp) => {
    inp.addEventListener("input", render);
  });

  // seletor de PERFIL DO PONTO (troca ticket + CMV + volume do perfil)
  el("perfil-premium").addEventListener("click", () => { if (perfil !== "premium") aplicarPerfil("premium"); });
  el("perfil-altogiro").addEventListener("click", () => { if (perfil !== "altoGiro") aplicarPerfil("altoGiro"); });

  // toggle CMV
  el("cmv-det").addEventListener("click", () => {
    cmvMode = "det";
    el("cmv-det").classList.add("on"); el("cmv-simp").classList.remove("on");
    el("cmv-detailed").style.display = "block"; el("cmv-simple").style.display = "none"; render();
  });
  el("cmv-simp").addEventListener("click", () => {
    cmvMode = "simp";
    el("cmv-simp").classList.add("on"); el("cmv-det").classList.remove("on");
    el("cmv-detailed").style.display = "none"; el("cmv-simple").style.display = "block"; render();
  });

  // seletor de operação (mão de obra)
  el("lab-self").addEventListener("click", () => {
    laborMode = "self";
    el("lab-self").classList.add("on"); el("lab-hire").classList.remove("on");
    el("labor-wrap").style.display = "none"; el("labor-self-note").style.display = "block"; render();
  });
  el("lab-hire").addEventListener("click", () => {
    laborMode = "hire";
    el("lab-hire").classList.add("on"); el("lab-self").classList.remove("on");
    el("labor-wrap").style.display = "block"; el("labor-self-note").style.display = "none"; render();
  });

  // horizonte do gráfico
  document.querySelectorAll(".simulador .hz").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".simulador .hz").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); horizonte = +b.dataset.hz; render();
    });
  });

  // Estado inicial: perfil Premium (preserva a experiência atual do site).
  // 'primeira=true' aplica os presets sem disparar render duplicado; o render
  // abaixo cuida da primeira pintura.
  aplicarPerfil("premium", true);
  render();
})();

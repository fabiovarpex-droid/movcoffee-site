/* ============================================================
   Mov Coffee — Simulador de Plano de Negócio
   Motor determinístico + interface. Portado do protótipo validado.

   Arquitetura de dois níveis:
   - INPUTS DO PROSPECT (sliders/toggle): cafés/dia, ticket, dias, ocupação,
     quem opera, custo do colaborador, nº de quiosques, investimento.
   - PREMISSAS DA REDE (objeto único abaixo): CMV, royalties, custos fixos
     recorrentes, impostos e taxas — travadas, só exibidas no painel recolhível.

   >>> Para atualizar as premissas da franqueadora, mude SOMENTE o objeto
       PREMISSAS abaixo. Toda a conta e os textos leem daqui. <<<

   Sem rampa de maturação: volume pleno desde o mês 1.
   Payback = investimento ÷ lucro líquido mensal.
   ============================================================ */

"use strict";

(function () {
  const raiz = document.querySelector(".simulador");
  if (!raiz) return; // só roda na página do simulador

  /* ============ PREMISSAS DA REDE (fonte única — editar aqui) ============ */
  const PREMISSAS = {
    // CMV por café (R$) — soma = cmvCopo. ~15% do ticket, ponderado pelo mix.
    cmvCafe: 0.9,          // grão torrado (~R$85/kg, ~11–13g/copo blended)
    cmvLeite: 0.45,        // rateio do mix (~45% bebidas com leite)
    cmvDescartaveis: 0.3,  // copo papel + tampa + palheta + açúcar
    cmvOutros: 0.15,       // base cold brew, higienização rateada

    // Custos fixos mensais recorrentes (R$)
    royalties: 800,        // fixo, travado (premissa da franqueadora)
    energia: 200,
    conectividade: 70,
    manutencao: 150,       // assistência técnica
    contabilidade: 400,    // comércio no Simples
    seguroHigiene: 160,

    // Impostos e taxas (% sobre a receita)
    aliquotaImposto: 6,    // ⚠️ confirmar anexo/alíquota efetiva do Simples
    taxaPagamento: 2.5,    // cartão + PIX
  };
  // Custo de mercadoria por café (R$) derivado das premissas de CMV.
  PREMISSAS.cmvCopo =
    PREMISSAS.cmvCafe + PREMISSAS.cmvLeite + PREMISSAS.cmvDescartaveis + PREMISSAS.cmvOutros;

  /* ============ Formatação PT-BR ============ */
  const BRL = new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  });
  const BRL2 = new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  });
  const pctBR = (v, casas = 1) => v.toFixed(casas).replace(".", ",") + "%";
  const el = (id) => document.getElementById(id);

  const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============ Estado da interface ============ */
  let laborMode = "self"; // 'self' (licenciado opera) | 'hire' (colaborador)
  let horizonte = 36;     // meses exibidos no gráfico (12 | 36 | 60)

  /* ============ Leitura dos inputs do prospect ============ */
  function readInputs() {
    return {
      capex: +el("capex").value,
      unid: +el("unid").value,
      ticket: +el("ticket").value,
      copos: +el("copos").value,
      dias: +el("dias").value,
      ocup: +el("ocup").value,
      mo: laborMode === "hire" ? +el("mo").value : 0,
      // premissas (constantes vindas do objeto único)
      cmvCopo: PREMISSAS.cmvCopo,
      roy: PREMISSAS.royalties,
      ener: PREMISSAS.energia,
      conec: PREMISSAS.conectividade,
      manut: PREMISSAS.manutencao,
      cont: PREMISSAS.contabilidade,
      seg: PREMISSAS.seguroHigiene,
      imp: PREMISSAS.aliquotaImposto,
      tax: PREMISSAS.taxaPagamento,
    };
  }

  /* ============ Motor de cálculo ============
     Tudo por UNIDADE; os totais da rede multiplicam por i.unid. */
  function custosFixosUnidade(i) {
    return i.ocup + i.roy + i.ener + i.conec + i.manut + i.cont + i.seg + i.mo;
  }

  // Regime pleno para um dado nº de cafés/dia (rede inteira).
  function regime(i, coposDia) {
    const coposMes = coposDia * i.dias;
    const receita = coposMes * i.ticket * i.unid;
    const cmv = coposMes * i.cmvCopo * i.unid;
    const impostos = receita * (i.imp / 100);
    const pagamento = receita * (i.tax / 100);
    const mc = receita - cmv - impostos - pagamento; // margem de contribuição
    const fixos = custosFixosUnidade(i) * i.unid;
    const lucro = mc - fixos;
    return { coposMes, receita, cmv, impostos, pagamento, mc, fixos, lucro };
  }

  // Payback SEM rampa: investimento ÷ lucro mensal (por unidade = rede, unidades idênticas).
  function payback(i, coposDia) {
    const rUnidade = regime({ ...i, unid: 1 }, coposDia);
    if (rUnidade.lucro <= 0) return null; // não atinge retorno neste cenário
    return i.capex / rUnidade.lucro;
  }

  // Break-even em cafés/dia (por unidade).
  function breakeven(i) {
    const mcCopo =
      i.ticket - i.cmvCopo - i.ticket * (i.imp / 100) - i.ticket * (i.tax / 100);
    if (mcCopo <= 0) return { viavel: false };
    const coposDia = custosFixosUnidade(i) / mcCopo / i.dias;
    return { viavel: true, coposDia };
  }

  /* ============ Animação count-up (respeita reduced-motion) ============
     O valor FINAL é sempre garantido, mesmo que o requestAnimationFrame seja
     pausado (aba em segundo plano) — números financeiros nunca podem ficar
     desatualizados na tela. */
  function animateNum(node, to, fmt) {
    // "Geração": cada novo valor invalida animações/timers pendentes do nó, para
    // que uma animação superada nunca sobrescreva um valor mais recente.
    const gen = (node._animGen = (node._animGen || 0) + 1);
    const from = parseFloat(node.dataset.raw || to) || 0;
    node.dataset.raw = to;
    if (reduzMovimento || from === to) { node.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 380;
    let done = false;
    const finalize = () => {
      if (!done && node._animGen === gen) { done = true; node.textContent = fmt(to); }
    };
    function step(t) {
      if (node._animGen !== gen) return; // superado por um render mais novo
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else finalize();
    }
    requestAnimationFrame(step);
    // Rede de segurança: o timer não fica preso ao repaint, então garante o
    // valor correto mesmo quando o rAF não dispara.
    setTimeout(finalize, dur + 120);
  }

  // Define um texto fixo no nó (ex.: "—"), cancelando qualquer animação pendente.
  function setNumText(node, text) {
    node._animGen = (node._animGen || 0) + 1;
    node.dataset.raw = 0;
    node.textContent = text;
  }

  /* ============ Gráfico de fluxo de caixa acumulado ============
     Reta: acum(m) = -capexRede + lucroRede * m. Marcador no payback. */
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
    const pct = (v) =>
      r.receita ? `<span class="sim-dre-pct">${(v / r.receita * 100).toFixed(0)}%</span>` : "";
    el("sim-dre").innerHTML =
      `<div class="sim-dre-row"><span class="l">Receita bruta</span><span class="v">${BRL.format(r.receita)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Impostos</span><span class="v">-${BRL.format(r.impostos)}${pct(r.impostos)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Taxa de pagamento</span><span class="v">-${BRL.format(r.pagamento)}${pct(r.pagamento)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) CMV (insumos)</span><span class="v">-${BRL.format(r.cmv)}${pct(r.cmv)}</span></div>` +
      `<div class="sim-dre-row total"><span class="l">Margem de contribuição</span><span class="v">${BRL.format(r.mc)}${pct(r.mc)}</span></div>` +
      `<div class="sim-dre-row neg"><span class="l">(−) Custos fixos</span><span class="v">-${BRL.format(r.fixos)}${pct(r.fixos)}</span></div>` +
      `<div class="sim-dre-row result total"><span class="l">Lucro líquido</span><span class="v ${r.lucro < 0 ? "neg" : ""}">${BRL.format(r.lucro)}${pct(r.lucro)}</span></div>`;
  }

  /* ============ Cenários (Conservador / Realista / Otimista) ============ */
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
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 50;
    input.style.setProperty("--pct", pct + "%");
  }

  /* ============ Render principal ============ */
  function render() {
    const i = readInputs();

    // rótulos dos inputs
    el("v-capex").textContent = BRL.format(i.capex);
    el("v-unid").textContent = i.unid;
    el("v-ticket").textContent = BRL.format(i.ticket).replace(/\s?,00$/, "");
    el("v-copos").textContent = i.copos;
    el("v-dias").textContent = i.dias;
    el("v-ocup").textContent = BRL.format(i.ocup);
    if (el("v-mo")) el("v-mo").textContent = BRL.format(+el("mo").value);

    document.querySelectorAll(".simulador input[type=range]").forEach(updateSliderFill);

    // cálculos (rede inteira, mais payback/break-even por unidade)
    const r = regime(i, i.copos);
    const pb = payback(i, i.copos);
    const be = breakeven(i);

    // HERÓI — Payback
    const pbNode = el("r-payback"), pbU = el("r-payback-u");
    if (pb === null) {
      setNumText(pbNode, "—"); pbU.textContent = "não atinge retorno";
    } else {
      animateNum(pbNode, pb, (v) => v.toFixed(1).replace(".", ",")); pbU.textContent = "meses";
    }

    // HERÓI — Lucro líquido/mês
    const lucroNode = el("r-lucro");
    lucroNode.classList.toggle("neg", r.lucro < 0);
    animateNum(lucroNode, r.lucro, (v) => BRL.format(v));

    // KPIs
    el("r-margem").textContent = (r.receita ? r.lucro / r.receita * 100 : 0).toFixed(0) + "%";
    el("r-be").textContent = be.viavel ? Math.ceil(be.coposDia) : "—";
    el("r-receita").textContent = "R$ " + (r.receita / 1000).toFixed(1).replace(".", ",") + "k";

    renderDRE(r);
    renderScen(i);
    drawChart(i);

    // legenda do gráfico
    const cap = el("sim-chart-cap");
    if (pb === null) {
      cap.textContent = "Neste cenário o investimento não é recuperado no horizonte simulado.";
    } else if (pb > horizonte) {
      cap.textContent = `Retorno em ~${pb.toFixed(1).replace(".", ",")} meses (fora do horizonte de ${horizonte}m exibido).`;
    } else {
      cap.textContent = `O caixa cruza o zero (retorno do investimento) em ~${pb.toFixed(1).replace(".", ",")} meses.`;
    }
  }

  /* ============ Painel de premissas (read-only) ============ */
  function preencherPremissas() {
    const P = PREMISSAS;
    const linha = (l, r) => `<div class="sim-prem-row"><span class="l">${l}</span><span class="r">${r}</span></div>`;
    el("sim-premissas-body").innerHTML =
      linha("Café (grão torrado)", BRL2.format(P.cmvCafe)) +
      linha("Leite (rateio do mix)", BRL2.format(P.cmvLeite)) +
      linha("Descartáveis", BRL2.format(P.cmvDescartaveis)) +
      linha("Outros insumos", BRL2.format(P.cmvOutros)) +
      linha("<strong style=\"color:var(--sim-text-high)\">CMV total por café</strong>", "<strong style=\"color:var(--sim-primary)\">" + BRL2.format(P.cmvCopo) + "</strong>") +
      linha("Royalties (fixo)", BRL.format(P.royalties)) +
      linha("Energia", BRL.format(P.energia)) +
      linha("Conectividade", BRL.format(P.conectividade)) +
      linha("Manutenção técnica", BRL.format(P.manutencao)) +
      linha("Contabilidade (Simples)", BRL.format(P.contabilidade)) +
      linha("Seguro + higienização", BRL.format(P.seguroHigiene)) +
      linha("Impostos (Simples)", pctBR(P.aliquotaImposto)) +
      linha("Taxa de pagamento (cartão + PIX)", pctBR(P.taxaPagamento));
  }

  /* ============ Listeners ============ */
  document.querySelectorAll(".simulador input[type=range]").forEach((inp) => {
    inp.addEventListener("input", render);
  });

  // seletor de operação (mão de obra)
  el("lab-self").addEventListener("click", () => {
    laborMode = "self";
    el("lab-self").classList.add("on"); el("lab-hire").classList.remove("on");
    el("labor-wrap").style.display = "none"; el("labor-self-note").style.display = "block";
    render();
  });
  el("lab-hire").addEventListener("click", () => {
    laborMode = "hire";
    el("lab-hire").classList.add("on"); el("lab-self").classList.remove("on");
    el("labor-wrap").style.display = "block"; el("labor-self-note").style.display = "none";
    render();
  });

  // horizonte do gráfico
  document.querySelectorAll(".simulador .hz").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".simulador .hz").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); horizonte = +b.dataset.hz; render();
    });
  });

  preencherPremissas();
  render();
})();

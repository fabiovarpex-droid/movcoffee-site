/* ============================================================
   Been On Coffee — interações do site
   0. Medida da altura real do header (âncoras + menu mobile)
   1. Header sticky com blur ao rolar (glassmorphism)
   2. Menu mobile (hambúrguer + backdrop + trava de scroll + teclado)
   3. Scrollspy: destaca no menu a seção que está na tela
   4. Barra de CTA fixa no celular (aparece depois do hero)
   5. Animações de entrada no scroll (Intersection Observer)
   6. Vídeo do hero (consciente de peso: 1 vídeo no celular, 2 no desktop)
   7. Validação do formulário + envio (endpoint configurável)
   8. Widget de chat com respostas pré-definidas do FAQ
   ============================================================ */

"use strict";

/* ============================================================
   CONFIGURAÇÃO — o que muda quando os dados reais existirem
   ============================================================ */
const CONFIG = {
  /* DADO REAL NECESSÁRIO (bloqueia o go-live): endpoint do CRM/webhook
     (RD Station, HubSpot, Zapier, Make, Formspree…). Enquanto estiver vazio,
     o lead é guardado no navegador (localStorage) e logado no console —
     ou seja, NÃO chega em ninguém. */
  endpointLead: "",
  /* DADO REAL NECESSÁRIO: WhatsApp comercial no formato 5511999999999.
     Vazio = nenhum botão de WhatsApp é criado (melhor do que um link quebrado). */
  whatsapp: "",
};

const prefereMenosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============ 0. ALTURA REAL DO HEADER ============
   O header é fixo. Sem publicar a altura dele em --altura-topo, toda âncora
   (#investimento, #faq…) parava com o título escondido atrás dele, e o menu
   mobile abria em cima do próprio header. */
const topo = document.getElementById("topo") || document.querySelector(".topo");

function medirTopo() {
  if (!topo) return;
  const altura = Math.round(topo.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--altura-topo", altura + "px");
}
medirTopo();
window.addEventListener("resize", medirTopo, { passive: true });
if ("ResizeObserver" in window && topo) new ResizeObserver(medirTopo).observe(topo);
// As fontes do Google mudam a altura do logo ao carregar
if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirTopo);

/* ============ 1. HEADER COM BLUR AO ROLAR ============ */
if (topo) {
  const aoRolar = () => topo.classList.toggle("rolado", window.scrollY > 20);
  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });
}

/* ============ 2. MENU MOBILE ============ */
const btnMenu = document.getElementById("btn-menu");
const menuLinks = document.getElementById("menu-links");

if (btnMenu && menuLinks) {
  // Backdrop criado por script para não repetir markup nas 3 páginas
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "topo__backdrop";
  backdrop.setAttribute("aria-label", "Fechar menu");
  backdrop.tabIndex = -1;
  topo.appendChild(backdrop);

  const abrirMenu = (abrir) => {
    menuLinks.classList.toggle("aberto", abrir);
    backdrop.classList.toggle("aberto", abrir);
    // Trava a rolagem do fundo: sem isso a página corria por trás do menu
    document.body.classList.toggle("menu-aberto", abrir);
    btnMenu.setAttribute("aria-expanded", String(abrir));
    btnMenu.setAttribute("aria-label", abrir ? "Fechar menu" : "Abrir menu");
    backdrop.tabIndex = abrir ? 0 : -1;
    if (abrir) {
      const primeiro = menuLinks.querySelector("a");
      // Força o recálculo de estilo antes do foco: o painel sai de
      // visibility:hidden e um elemento invisível não aceita foco.
      void menuLinks.offsetHeight;
      if (primeiro) primeiro.focus({ preventScroll: true });
    }
  };

  btnMenu.addEventListener("click", () => abrirMenu(!menuLinks.classList.contains("aberto")));
  backdrop.addEventListener("click", () => { abrirMenu(false); btnMenu.focus(); });

  menuLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => abrirMenu(false));
  });

  // Esc fecha e devolve o foco para o hambúrguer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuLinks.classList.contains("aberto")) {
      abrirMenu(false);
      btnMenu.focus();
    }
  });

  // Girar o aparelho ou passar para desktop não pode deixar o menu preso aberto
  const consultaDesktop = window.matchMedia("(min-width: 800px)");
  const aoTrocarLargura = (e) => { if (e.matches) abrirMenu(false); };
  if (consultaDesktop.addEventListener) consultaDesktop.addEventListener("change", aoTrocarLargura);
  else consultaDesktop.addListener(aoTrocarLargura);
}

/* ============ 3. SCROLLSPY (seção atual no menu) ============ */
const secoesAlvo = [...document.querySelectorAll("main section[id]")];
const linksInternos = menuLinks
  ? [...menuLinks.querySelectorAll('a[href*="#"]:not(.botao)')]
  : [];

if (secoesAlvo.length && linksInternos.length && "IntersectionObserver" in window) {
  const porId = new Map();
  linksInternos.forEach((a) => {
    const id = (a.getAttribute("href") || "").split("#")[1];
    if (id) porId.set(id, a);
  });

  let atual = null;
  const observadorSecoes = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        const link = porId.get(entrada.target.id);
        if (!link || link === atual) return;
        if (atual) atual.removeAttribute("aria-current");
        link.setAttribute("aria-current", "true");
        atual = link;
      });
    },
    // Faixa estreita logo abaixo do header: marca a seção que está "na leitura"
    { rootMargin: "-25% 0px -65% 0px" }
  );
  secoesAlvo.forEach((s) => { if (porId.has(s.id)) observadorSecoes.observe(s); });
}

/* ============ 4. BARRA DE CTA FIXA NO CELULAR ============
   Aparece assim que o visitante passa do hero e some quando o formulário de
   cadastro entra na tela (não faz sentido chamar para o que já está à vista). */
(() => {
  const hero = document.querySelector(".hero");
  const cadastro = document.getElementById("cadastro");
  // Só nas páginas com formulário de cadastro (home e simulador). No mapa a
  // barra brigaria com a legenda e o painel de município, que já ocupam o
  // rodapé da tela no celular.
  if (!cadastro || !("IntersectionObserver" in window)) return;

  const barra = document.createElement("div");
  barra.className = "barra-cta";
  const noSimulador = !!document.querySelector(".simulador");
  barra.innerHTML =
    `<a class="botao" href="#cadastro">Quero ser licenciado</a>` +
    (noSimulador ? "" : `<a class="botao botao--fantasma" href="simulador.html">Simular</a>`);
  document.body.appendChild(barra);

  const alturaBarra = () =>
    document.documentElement.style.setProperty(
      "--altura-barra-cta",
      barra.classList.contains("visivel") ? barra.offsetHeight + "px" : "0px"
    );

  const mostrar = (v) => {
    barra.classList.toggle("visivel", v);
    document.body.classList.toggle("com-barra-cta", v);
    alturaBarra();
  };

  let passouDoHero = !hero;
  let cadastroVisivel = false;
  const atualizar = () => mostrar(passouDoHero && !cadastroVisivel);

  if (hero) {
    new IntersectionObserver(
      ([e]) => { passouDoHero = !e.isIntersecting; atualizar(); },
      { threshold: 0.15 }
    ).observe(hero);
  }
  if (cadastro) {
    new IntersectionObserver(
      ([e]) => { cadastroVisivel = e.isIntersecting; atualizar(); },
      { threshold: 0.08 }
    ).observe(cadastro);
  }
  window.addEventListener("resize", alturaBarra, { passive: true });
})();

/* ============ 5. ANIMAÇÕES DE ENTRADA (scroll reveal) ============ */
const elementosRevelar = document.querySelectorAll(".revelar");

if (prefereMenosMovimento || !("IntersectionObserver" in window)) {
  // Sem animação: mostra tudo imediatamente
  elementosRevelar.forEach((el) => el.classList.add("visivel"));
} else {
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("visivel");
          observador.unobserve(entrada.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  elementosRevelar.forEach((el) => observador.observe(el));
}

/* ============ 6. VÍDEO DO HERO ============
   Peso é o critério aqui. O hero pesava ~4,8 MB de vídeo (dois arquivos) em
   qualquer aparelho, inclusive no 4G do candidato. Agora:
   - celular  → 1 vídeo (o mais leve), em loop nativo (baixa uma vez só);
   - desktop  → os 2 vídeos em sequência;
   - economia de dados / 2g / 3g / movimento reduzido → nenhum vídeo, só a
     animação CSS de vapor, que já é o fundo padrão;
   - o carregamento começa depois do load da página, para não competir com
     texto, CSS e imagem principal;
   - fora da tela, o vídeo pausa (bateria e CPU no celular). */
const heroVideo = document.getElementById("hero-video");
if (heroVideo) {
  const conexao = navigator.connection || {};
  const economiaDados = conexao.saveData === true;
  const conexaoLenta = /(^|-)(2g|3g)$/.test(conexao.effectiveType || "");
  const telaPequena = window.matchMedia("(max-width: 799px)").matches;

  const hero = heroVideo.closest(".hero");
  heroVideo.addEventListener("playing", () => hero.classList.add("com-video"));

  // Playlist do hero. Para trocar/adicionar vídeos, edite estas constantes.
  const videoCopo = "assets/hero-coffee-novo.mp4"; // copo de café, close-up (mais pesado)
  const videoQuiosque = "assets/hero-coffee-novo-2.mp4"; // quiosque no mercado (mais leve)
  const playlistDesktop = [videoCopo, videoQuiosque];
  // No celular usamos só o vídeo mais leve (economia de dados), independente da ordem acima.
  const playlist = telaPequena ? [videoQuiosque] : playlistDesktop;
  let indiceVideo = 0;

  function tocarVideoHero(indice) {
    indiceVideo = indice;
    heroVideo.src = playlist[indice];
    heroVideo.load();
    const tentativa = heroVideo.play();
    if (tentativa && typeof tentativa.catch === "function") {
      tentativa.catch(() => { /* sem vídeo ou autoplay bloqueado — animação CSS fica visível */ });
    }
  }

  if (playlist.length === 1) {
    // Um vídeo só: loop nativo, sem trocar o src (não rebaixa o arquivo a cada volta)
    heroVideo.loop = true;
  } else {
    heroVideo.addEventListener("ended", () => {
      tocarVideoHero((indiceVideo + 1) % playlist.length);
    });
  }

  if (prefereMenosMovimento || economiaDados || conexaoLenta) {
    heroVideo.removeAttribute("autoplay");
    heroVideo.preload = "none";
  } else {
    const iniciar = () => {
      heroVideo.preload = "auto";
      tocarVideoHero(0);
    };
    // Só depois que o essencial da página carregou
    if (document.readyState === "complete") setTimeout(iniciar, 60);
    else window.addEventListener("load", () => setTimeout(iniciar, 60), { once: true });

    // Pausa quando o hero sai da tela
    if ("IntersectionObserver" in window && hero) {
      new IntersectionObserver(
        ([e]) => {
          if (!heroVideo.src) return;
          if (e.isIntersecting) heroVideo.play().catch(() => {});
          else heroVideo.pause();
        },
        { threshold: 0.05 }
      ).observe(hero);
    }
  }
}

/* ============ 7. FORMULÁRIO ============ */
const form = document.getElementById("form-franqueado");

// O formulário só existe na home e no simulador. Em outras páginas este bloco
// é ignorado, para que header/menu/chat continuem funcionando lá.
if (form) {
const confirmacao = document.getElementById("confirmacao");
const botaoEnviar = form.querySelector('button[type="submit"]');
const textoBotao = botaoEnviar ? botaoEnviar.textContent : "";

// Máscara simples de telefone brasileiro: (11) 99999-9999
const campoTelefone = document.getElementById("telefone");
campoTelefone.addEventListener("input", () => {
  let d = campoTelefone.value.replace(/\D/g, "").slice(0, 11);
  if (d.length > 6) {
    campoTelefone.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  } else if (d.length > 2) {
    campoTelefone.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  } else if (d.length > 0) {
    campoTelefone.value = `(${d}`;
  }
});

function marcarErro(idCampo, temErro) {
  const campo = document.getElementById(idCampo);
  const erro = document.getElementById("erro-" + idCampo);
  if (campo) {
    campo.classList.toggle("invalido", temErro);
    campo.setAttribute("aria-invalid", String(temErro));
  }
  if (erro) erro.hidden = !temErro;
  return !temErro;
}

function validarFormulario() {
  let valido = true;

  const nome = document.getElementById("nome").value.trim();
  valido = marcarErro("nome", nome.length < 5 || !nome.includes(" ")) && valido;

  const telefoneDigitos = campoTelefone.value.replace(/\D/g, "");
  valido = marcarErro("telefone", telefoneDigitos.length < 10) && valido;

  const email = document.getElementById("email").value.trim();
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  valido = marcarErro("email", !emailValido) && valido;

  const cidade = document.getElementById("cidade").value.trim();
  valido = marcarErro("cidade", cidade.length < 3) && valido;

  const capital = document.getElementById("capital").value;
  valido = marcarErro("capital", capital === "") && valido;

  const experiencia = form.querySelector('input[name="experiencia"]:checked');
  document.getElementById("erro-experiencia").hidden = !!experiencia;
  valido = !!experiencia && valido;

  // Consentimento LGPD explícito: sem o aceite, o lead não é enviado
  const consentimento = document.getElementById("consentimento");
  valido = marcarErro("consentimento", !consentimento.checked) && valido;

  return valido;
}

// Validação ao sair do campo: o candidato corrige na hora, em vez de
// descobrir 6 erros de uma vez ao clicar em enviar.
["nome", "telefone", "email", "cidade", "capital"].forEach((id) => {
  const campo = document.getElementById(id);
  if (!campo) return;
  campo.addEventListener("blur", () => {
    if (campo.classList.contains("invalido") || campo.value.trim() !== "") validarFormulario();
  });
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!validarFormulario()) {
    const primeiroErro = form.querySelector(".invalido, .campo__erro:not([hidden])");
    if (primeiroErro) {
      primeiroErro.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof primeiroErro.focus === "function") primeiroErro.focus({ preventScroll: true });
    }
    return;
  }

  const dados = {
    nome: document.getElementById("nome").value.trim(),
    telefone: campoTelefone.value,
    email: document.getElementById("email").value.trim(),
    cidade: document.getElementById("cidade").value.trim(),
    capital: document.getElementById("capital").value,
    experiencia: form.querySelector('input[name="experiencia"]:checked').value,
    // Perfil de ponto simulado (premium | alto_giro). Preenchido quando o lead vem
    // da página do simulador; 'premium' como padrão nas demais páginas. Vira a
    // propriedade `perfil_ponto` no CRM/HubSpot e no evento de analytics do lead.
    perfil_ponto: document.querySelector(".simulador")?.dataset.perfil || "premium",
    origem: "site-franquia",
    pagina: location.pathname,
    // Registro do consentimento LGPD (base legal: consentimento, Lei 13.709/2018)
    consentimentoLgpd: true,
    consentimentoTexto:
      "Autorizo o uso dos meus dados exclusivamente para contato sobre a franquia Been On Coffee, conforme a Política de Privacidade (LGPD).",
    dataEnvio: new Date().toISOString(),
  };

  if (botaoEnviar) {
    botaoEnviar.setAttribute("aria-busy", "true");
    botaoEnviar.textContent = "Enviando…";
  }

  let enviado = false;
  if (CONFIG.endpointLead) {
    try {
      const resposta = await fetch(CONFIG.endpointLead, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error("Falha no envio: " + resposta.status);
      enviado = true;
    } catch (erro) {
      if (botaoEnviar) {
        botaoEnviar.removeAttribute("aria-busy");
        botaoEnviar.textContent = textoBotao;
      }
      mostrarResumoErro(
        "Não foi possível enviar agora. Confira sua conexão e tente novamente em instantes."
      );
      return;
    }
  }

  // Rede de segurança enquanto não há endpoint: o lead fica guardado no
  // navegador do candidato e no console. NÃO substitui o CRM — ver CONFIG.
  if (!enviado) {
    try {
      const fila = JSON.parse(localStorage.getItem("been_leads") || "[]");
      fila.push(dados);
      localStorage.setItem("been_leads", JSON.stringify(fila));
    } catch (e) { /* modo privado / storage cheio */ }
    console.warn(
      "[Been On Coffee] Lead capturado mas NÃO enviado: CONFIG.endpointLead está vazio em js/script.js.",
      dados
    );
  }

  form.hidden = true;
  if (confirmacao) {
    confirmacao.hidden = false;
    confirmacao.scrollIntoView({ behavior: "smooth", block: "center" });
    confirmacao.setAttribute("tabindex", "-1");
    confirmacao.focus({ preventScroll: true });
  }
});

function mostrarResumoErro(mensagem) {
  let caixa = form.querySelector(".formulario__resumo-erro");
  if (!caixa) {
    caixa = document.createElement("p");
    caixa.className = "formulario__resumo-erro";
    caixa.setAttribute("role", "alert");
    form.prepend(caixa);
  }
  caixa.innerHTML = `<strong>Ops.</strong> ${mensagem}`;
  caixa.scrollIntoView({ behavior: "smooth", block: "center" });
}
} // fim do bloco do formulário

/* ============ 8. WIDGET DE CHAT ============ */
/* Placeholder de chat: respostas fixas vindas do FAQ.
   DADO REAL NECESSÁRIO: integração futura com chat ao vivo
   (ex.: Tawk.to, Crisp, JivoChat ou WhatsApp Business). */

const chatBotao = document.getElementById("chat-botao");
const chatPainel = document.getElementById("chat-painel");
const chatMensagens = document.getElementById("chat-mensagens");
const chatPerguntas = document.getElementById("chat-perguntas");

// O widget de chat pode não existir em todas as páginas; só ativa se estiver presente.
if (chatBotao && chatPainel && chatMensagens && chatPerguntas) {

const perguntasRapidas = [
  {
    pergunta: "Qual o investimento?",
    resposta:
      "O quiosque completo custa R$ 72.000 (valor aproximado): máquina, totem, mobiliário e estoque do 1º mês. Não inclui frete, abertura de empresa e capital de giro — no simulador você projeta o total na sua realidade.",
  },
  {
    pergunta: "Prazo de instalação?",
    resposta:
      "Com o contrato do ponto assinado, a instalação leva de 30 a 45 dias em média — o quiosque chega pré-fabricado.",
  },
  {
    pergunta: "Preciso de experiência?",
    resposta:
      "Não! O treinamento de 1 semana + acompanhamento de 90 dias cobre tudo: máquina, insumos e atendimento.",
  },
  {
    pergunta: "Tem exclusividade?",
    resposta:
      "Sim, por ponto: cada unidade tem exclusividade no empreendimento em que está instalada.",
  },
  {
    pergunta: "Quais são os próximos passos?",
    resposta:
      "São 5 etapas: cadastro → conversa com a expansão → COF e análise (mínimo 10 dias por lei) → assinatura e escolha do ponto → instalação e treinamento.",
  },
  {
    pergunta: "Falar com a equipe",
    resposta:
      "Preencha o formulário de cadastro aqui do site que nossa equipe de expansão retorna em até 2 dias úteis! 👇",
  },
];

perguntasRapidas.forEach(({ pergunta, resposta }) => {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = pergunta;
  botao.addEventListener("click", () => {
    adicionarMensagem(pergunta, "usuario");
    setTimeout(() => adicionarMensagem(resposta, "bot"), 450);
  });
  chatPerguntas.appendChild(botao);
});

function adicionarMensagem(texto, autor) {
  const div = document.createElement("div");
  div.className = `chat__mensagem chat__mensagem--${autor}`;
  div.textContent = texto;
  chatMensagens.appendChild(div);
  chatMensagens.scrollTop = chatMensagens.scrollHeight;
}

const alternarChat = (abrir) => {
  chatPainel.hidden = !abrir;
  chatBotao.setAttribute("aria-expanded", String(abrir));
  chatBotao.setAttribute("aria-label", abrir ? "Fechar chat de dúvidas" : "Abrir chat de dúvidas");
};

chatBotao.addEventListener("click", () => alternarChat(chatPainel.hidden));

// Esc fecha o chat também
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !chatPainel.hidden) { alternarChat(false); chatBotao.focus(); }
});
} // fim do bloco do chat

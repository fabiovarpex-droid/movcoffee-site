/* ============================================================
   Mov Coffee — interações do site
   1. Header sticky com blur ao rolar (glassmorphism)
   2. Menu mobile (hamburguer)
   3. Animações de entrada no scroll (Intersection Observer)
   4. Vídeo do hero (respeita prefers-reduced-motion / economia de dados)
   5. Validação do formulário + envio (placeholder de webhook)
   6. Widget de chat com respostas pré-definidas do FAQ
   ============================================================ */

"use strict";

/* ============ 1. HEADER COM BLUR AO ROLAR ============ */
const topo = document.getElementById("topo");
const aoRolar = () => topo.classList.toggle("rolado", window.scrollY > 20);
aoRolar();
window.addEventListener("scroll", aoRolar, { passive: true });

/* ============ 2. MENU MOBILE ============ */
const btnMenu = document.getElementById("btn-menu");
const menuLinks = document.getElementById("menu-links");

btnMenu.addEventListener("click", () => {
  const aberto = menuLinks.classList.toggle("aberto");
  btnMenu.setAttribute("aria-expanded", String(aberto));
  btnMenu.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
});

menuLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuLinks.classList.remove("aberto");
    btnMenu.setAttribute("aria-expanded", "false");
  });
});

/* ============ 3. ANIMAÇÕES DE ENTRADA (scroll reveal) ============ */
const prefereMenosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

/* ============ 4. VÍDEO DO HERO ============
   Autoplay só quando faz sentido: respeita prefers-reduced-motion e o modo
   de economia de dados. Caso contrário, exibe apenas o poster (imagem estática). */
const heroVideo = document.getElementById("hero-video");
if (heroVideo) {
  const conexao = navigator.connection || {};
  const economiaDados = conexao.saveData === true;
  const conexaoLenta = /2g/.test(conexao.effectiveType || "");

  const hero = heroVideo.closest(".hero");
  // Quando um vídeo começar a tocar, troca a animação de fundo pelo vídeo
  heroVideo.addEventListener("playing", () => hero.classList.add("com-video"));

  // Playlist do hero: os vídeos tocam em sequência e recomeçam do início (loop).
  // Para adicionar/trocar vídeos, edite esta lista.
  const playlistHero = ["assets/hero-coffee.mp4", "assets/hero-coffee-2.mp4"];
  let indiceVideo = 0;

  function tocarVideoHero(indice) {
    indiceVideo = indice;
    heroVideo.src = playlistHero[indice];
    heroVideo.load();
    const tentativa = heroVideo.play();
    if (tentativa && typeof tentativa.catch === "function") {
      tentativa.catch(() => { /* sem vídeo ou autoplay bloqueado — animação CSS fica visível */ });
    }
  }

  // Ao terminar um vídeo, avança para o próximo (após o último, volta ao primeiro)
  heroVideo.addEventListener("ended", () => {
    tocarVideoHero((indiceVideo + 1) % playlistHero.length);
  });

  if (prefereMenosMovimento || economiaDados || conexaoLenta) {
    // Não carrega/reproduz vídeo — a animação de fundo (ou o poster) permanece
    heroVideo.removeAttribute("autoplay");
    heroVideo.preload = "none";
  } else {
    // Começa pelo primeiro vídeo da playlist. Se o arquivo não existir, o play()
    // falha silenciosamente e a animação de fundo CSS continua visível.
    heroVideo.preload = "auto";
    tocarVideoHero(0);
  }
}

/* ============ 5. FORMULÁRIO ============ */
const form = document.getElementById("form-franqueado");

// O formulário só existe na home. Em outras páginas (ex.: simulador.html) este
// bloco é ignorado, para que header/menu/chat continuem funcionando lá.
if (form) {
const confirmacao = document.getElementById("confirmacao");

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
  if (campo) campo.classList.toggle("invalido", temErro);
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

  return valido;
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!validarFormulario()) {
    const primeiroErro = form.querySelector(".invalido, .campo__erro:not([hidden])");
    if (primeiroErro) primeiroErro.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const dados = {
    nome: document.getElementById("nome").value.trim(),
    telefone: campoTelefone.value,
    email: document.getElementById("email").value.trim(),
    cidade: document.getElementById("cidade").value.trim(),
    capital: document.getElementById("capital").value,
    experiencia: form.querySelector('input[name="experiencia"]:checked').value,
    origem: "site-franquia",
    dataEnvio: new Date().toISOString(),
  };

  /* ============================================================
     DADO REAL NECESSÁRIO: integração com o CRM.
     Quando tiver o endpoint/webhook (RD Station, HubSpot, Zapier,
     Make, planilha etc.), descomente o bloco abaixo e troque a URL.
     ============================================================

  try {
    const resposta = await fetch("https://SEU-ENDPOINT-AQUI.com/webhook", {
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

  // Enquanto não há endpoint, registramos no console para conferência
  console.log("Cadastro capturado (aguardando integração com CRM):", dados);

  form.hidden = true;
  confirmacao.hidden = false;
  confirmacao.scrollIntoView({ behavior: "smooth", block: "center" });
});
} // fim do bloco do formulário (só na home)

/* ============ 6. WIDGET DE CHAT ============ */
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
      "O investimento do quiosque completo é de R$ 69.000 (valor de referência, sujeito a confirmação): máquina, mobiliário e estoque do 1º mês. Frete não incluso.",
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

chatBotao.addEventListener("click", () => {
  const abrir = chatPainel.hidden;
  chatPainel.hidden = !abrir;
  chatBotao.setAttribute("aria-expanded", String(abrir));
  chatBotao.setAttribute("aria-label", abrir ? "Fechar chat de dúvidas" : "Abrir chat de dúvidas");
});
} // fim do bloco do chat

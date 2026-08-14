# Relatório — Revisão final: mobile, peso e conversão

> Data: 13/08/2026 · Escopo: `index.html`, `simulador.html`, `mapa-potencial.html`,
> `politica-de-privacidade.html`, CSS, JS e configuração de deploy.
> Complementa o `RELATORIO-REVISAO-COMERCIAL.md` (revisão de conteúdo B2B).

---

## 1. O problema do mobile: por que a navegação "flutuava"

Não era uma coisa só — eram cinco defeitos somados, todos no celular:

| # | Defeito medido | Efeito para o candidato | Correção |
|---|---|---|---|
| 1 | `scroll-padding-top` ausente com header fixo de 64px | **Todo** clique no menu ("Investimento", "Dúvidas", "Cadastro") parava com o título da seção escondido atrás do header | `--altura-topo` medida por JS (e remedida no resize e após o carregamento das fontes) alimenta `scroll-padding-top` em `html` e `body` |
| 2 | Header 100% transparente antes do scroll | Logo, CTA e hambúrguer flutuavam soltos sobre o vídeo, ilegíveis dependendo do frame | Header opaco com blur desde o topo no celular (`max-width: 799px`) |
| 3 | Menu aberto não travava a rolagem do fundo | A página corria por trás do menu — a sensação exata de "navegação flutuando" | `body.menu-aberto { overflow: hidden }` + backdrop escuro clicável |
| 4 | Menu `position: absolute` sem altura máxima | Em aparelhos baixos / paisagem o menu estourava a tela sem poder rolar | Painel `position: fixed` ancorado em `--altura-topo`, com `max-height: 100dvh - header` e rolagem própria |
| 5 | Logo e CTA encostados (**0 px** de folga a 375px) | Cabeçalho apertado; a 360px o hambúrguer era empurrado para fora | Folga de 44px a 375px e 27px a 320px; abaixo de 350px o rótulo vira "Ser licenciado" |

**Verificado:** as âncoras `#oportunidade`, `#como-funciona`, `#investimento`,
`#processo`, `#faq` e `#cadastro` agora param entre 13,6 e 14,4px **abaixo** do
header, em vez de por baixo dele.

Extras de navegação no mesmo pacote:

- **Esc** fecha o menu e devolve o foco ao hambúrguer; clique no backdrop também.
- Girar o aparelho ou passar para desktop não deixa mais o menu preso aberto.
- Alvos de toque dos links do menu: **48–51px** (mínimo recomendado: 44px).
- **Scrollspy**: o menu destaca em laranja a seção que está sendo lida.
- Link "pular para o conteúdo" no primeiro Tab (acessibilidade de teclado).
- Barra de progresso do cabeçalho no desktop: o menu passou a caber em 1024px
  (com o espaçamento anterior ele quebrava a linha nessa largura).

---

## 2. Peso: de ~4,9 MB para 1,86 MB no celular

O hero era o problema. Ele carregava **dois vídeos (4,9 MB)** em qualquer
aparelho e — por trocar o `src` a cada volta do loop — **rebaixava os arquivos
a cada ciclo**, indefinidamente.

| | Antes | Depois |
|---|---|---|
| Peso da home no celular | ~4,9 MB (e crescendo em loop) | **1,86 MB**, baixado uma vez |
| Vídeos no celular | 2 arquivos, re-download a cada ciclo | 1 arquivo (1,8 MB) em `loop` nativo |
| Vídeos no desktop | 2 arquivos, re-download a cada ciclo | 2 arquivos, cache do navegador |
| Quando começa a baixar | junto com o CSS e o texto | depois do `load` da página |
| Fora da tela | continua decodificando | **pausa** |
| Pasta `assets/` | 13 MB | **5,4 MB** |

Também:

- **Removidos 3 vídeos órfãos** (`hero-coffee-1.mp4`, `hero-coffee-3.mp4`,
  `hero-coffee.mp4` = 7,9 MB) que não eram referenciados por nenhum arquivo do
  site e mesmo assim subiam no deploy. Estão preservados no histórico do git —
  para recuperar: `git checkout HEAD~1 -- assets/hero-coffee-1.mp4`.
- Economia de dados, 2G/3G e "reduzir movimento" agora **não baixam vídeo
  nenhum** (antes só 2G era considerado).
- `will-change` removido dos ~70 elementos animados: criava uma camada de
  composição permanente para cada um, pesando scroll e memória no celular.
- `.vercelignore`: brandbook, e-book (411 KB), modelo de licenciadora, o PDF de
  4 MB e a documentação interna **não sobem mais** para o servidor. Antes eram
  bloqueados por rota no `vercel.json`, ou seja, continuavam publicados para
  quem adivinhasse o nome.
- `vercel.json`: cache de 30 dias para `/assets/` e `/data/`, 1 hora com
  `stale-while-revalidate` para CSS/JS, mais cabeçalhos de segurança
  (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`).

**Ainda dá para melhorar:** o vídeo do hero é 1920×1080 para uma tela de 375px.
Recomprimir para 1280px de largura corta ~70% do peso — comando pronto no
README (precisa de `ffmpeg`, que não está instalado nesta máquina).

---

## 3. Conversão: o que foi acrescentado

### 3.1 Barra de CTA fixa no celular
Aparece assim que o candidato passa do hero e some quando o formulário entra na
tela. Em uma página de ~16.000px de altura no celular, ele nunca fica a mais de
um toque do cadastro. O botão do chat sobe automaticamente para não empilhar.

### 3.2 Seção "Do cadastro à inauguração, em 5 etapas"
A maior objeção de quem chega no formulário de uma franquia é não saber o que
acontece depois de clicar. A nova linha do tempo responde antes da pergunta:

> **Preencher o formulário não compromete você a nada.**
> Cadastro (agora) → Conversa com a expansão (até 2 dias úteis) → **COF e
> análise (mín. 10 dias por lei)** → Assinatura e escolha do ponto → Instalação
> e treinamento (30 a 45 dias).

Citar o prazo legal da COF no site, antes de o candidato perguntar, é sinal de
franqueadora séria — e é exatamente o que separa o site de um infoproduto.

### 3.3 Lista "O que a franqueadora entrega"
Seis itens concretos (análise do ponto, quiosque pronto, blend e cadeia de
insumos, manual e treinamento, assistência técnica, exclusividade do ponto).
Permite ao candidato comparar com outra franquia sem precisar ligar.

### 3.4 Formulário mais fácil de completar
- Validação **ao sair do campo**: o candidato corrige na hora, em vez de
  descobrir 6 erros de uma vez ao clicar em enviar.
- Botão com estado "Enviando…" e mensagem de erro de rede com instrução clara.
- `aria-invalid` nos campos com erro (leitores de tela).
- **Rede de segurança:** enquanto o CRM não estiver ligado, o lead é gravado no
  `localStorage` além do console. Não substitui a integração — ver §5.

### 3.5 Limpeza
Removida a faixa "Pontos-alvo da expansão: Shoppings · Aeroportos · Academias…"
da seção de prova: repetia, em texto solto e sem marca nenhuma, os mesmos canais
que a vitrine de pontos logo acima já mostra com foto. A seção ficou sendo só o
pitch de fundador da rede, que é o argumento forte ali.

---

## 4. SEO, acessibilidade e polimento

- **Dados estruturados de FAQ** (`schema.org/FAQPage`): habilita as perguntas
  aparecerem direto no resultado do Google. Tráfego qualificado sem mídia paga.
- **`og:image` corrigido**: apontava para `/assets/og-image.jpg`, **que não
  existe** — todo link do site compartilhado no WhatsApp ou LinkedIn saía sem
  miniatura. Agora aponta para a foto real do quiosque.
- `canonical`, `og:site_name`, `og:image:alt` e `twitter:card` adicionados.
- `robots.txt` e `sitemap.xml` criados.
- Página **404** na identidade do site ("Essa página saiu para tomar um café").
- Números do hero em grade de 2 colunas no celular (antes quebravam 3+1).
- Dica visual de que a tabela comparativa rola na horizontal.
- Área segura do iPhone (notch e barra inferior) respeitada no header, no menu,
  na barra de CTA e no botão do chat.
- `.politica` deixou de usar padding fixo de 6rem, que colava o título no header.

---

## 5. Verificação executada

| O quê | Resultado |
|---|---|
| Larguras 320, 375, 768, 1024 e 1280px | Sem estouro horizontal em nenhuma (`scrollWidth == innerWidth`) |
| Âncoras do menu (6 seções) | Todas param 13,6–14,4px abaixo do header |
| Menu mobile: abrir, backdrop, Esc, foco, trava de scroll | Tudo funcionando; foco entra no 1º link e volta ao hambúrguer |
| Formulário ponta a ponta | Envio vazio bloqueado (7 erros exibidos, `aria-invalid=true`); envio completo mascara o telefone, esconde o formulário, mostra a confirmação e grava o lead |
| Motor do simulador (intocado) | 40 cafés/dia → R$ 7.736 · 120 cafés/dia → R$ 29.768 |
| Mapa de potencial | Leaflet carrega; a barra de CTA **não** é criada ali (brigaria com a legenda e o painel de município) |
| Console das 3 páginas | **Zero erros** |
| Peso da home no celular | 1.865 KB (medido via Resource Timing) |

Não foi possível tirar screenshots: o painel do navegador não estava sendo
exibido nesta sessão, então a verificação foi feita por medição do DOM e do
CSS computado, não por inspeção visual.

---

## 6. Pendências que continuam bloqueando o go-live

Nenhuma delas é técnica — todas dependem de dado real:

1. **`CONFIG.endpointLead` vazio em `js/script.js`.** Sem ele, o cadastro **não
   chega em ninguém**: fica no navegador do próprio candidato. É o item mais
   urgente da lista.
2. **CNPJ e razão social** da franqueadora (rodapé e política de privacidade).
   Sem entidade real não há COF válida.
3. **E-mail do encarregado (DPO)** na política de privacidade — hoje é exemplo.
4. **Domínio final** em `index.html`, `robots.txt` e `sitemap.xml`.
5. **Prazos da seção "Próximos passos"** confirmados com a equipe de expansão.
6. Imagem de compartilhamento 1200×630 dedicada, com a marca.
7. As decisões pendentes do relatório anterior (headline do hero, margem de 54%
   no simulador, condição comercial da "primeira turma", regime
   licenciamento × franquia) continuam abertas.

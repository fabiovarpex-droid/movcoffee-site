# Been On Coffee — Site de vendas de franquia

Site de página única (single-page) para captação de candidatos a licenciado dos
quiosques de autoatendimento de café **Been On Coffee**.

Identidade visual: **grafite escuro + laranja neon (#FF7A3D)**, tipografia
Space Grotesk, tom tech-forward. Hero com vídeo em background, animações de
entrada no scroll e cards em glassmorphism.

Feito em **HTML, CSS e JavaScript puros** — sem frameworks, sem build, sem
dependências externas (as animações usam a API nativa Intersection Observer).
A única biblioteca de terceiros do projeto é o Leaflet, e só na página do mapa.

## Estrutura dos arquivos

```
index.html                    → página principal (hero → cadastro)
simulador.html                → simulador de plano de negócio
mapa-potencial.html           → mapa de potencial por município (Leaflet)
politica-de-privacidade.html  → política de privacidade (LGPD)
404.html                      → página de erro
robots.txt / sitemap.xml      → SEO

css/styles.css                → estilos do site (mobile-first)
css/simulador.css             → estilos do simulador
css/mapa.css                  → estilos do mapa
js/script.js                  → header, menu, barra de CTA, animações, formulário e chat
js/simulador.js               → motor de cálculo do simulador
js/mapa.js                    → mapa de potencial

assets/favicon.svg            → ícone do site
assets/hero-poster.svg        → poster do vídeo do hero
assets/hero-coffee-novo-2.mp4 → vídeo 1 do hero (usado sozinho no celular)
assets/hero-coffee-novo.mp4   → vídeo 2 do hero (só no desktop)
assets/quiosque/              → foto do quiosque completo
assets/pontos/                → fotos do quiosque por ambiente (renders)

vercel.json                   → cache e cabeçalhos de segurança do deploy
.vercelignore                 → o que NÃO sobe para o site publicado
servidor-local.js             → mini-servidor para testar localmente
```

## Como rodar localmente

**Jeito mais simples:** dê dois cliques em `index.html` — abre direto no navegador.

**Jeito recomendado** (com servidor local, igual ao ambiente de produção):

```bash
node servidor-local.js
```

Depois abra http://localhost:4173 no navegador.
(Alternativa: `npx serve .`, que abre em http://localhost:3000.)

## Como fazer o deploy

### Opção A — Vercel (recomendado)

1. Crie uma conta gratuita em https://vercel.com
2. Instale o CLI: `npm i -g vercel`
3. Na pasta do projeto, rode: `vercel` e siga as perguntas (aceite os padrões)
4. Pronto — a Vercel devolve a URL pública. Para atualizar, rode `vercel --prod`

Também dá para conectar um repositório do GitHub na Vercel: todo `git push`
vira deploy automático.

O `.vercelignore` garante que brandbook, e-book, modelo de licenciadora e a
documentação interna **não subam** para o site publicado.

### Opção B — Cloudflare Pages

1. Crie uma conta em https://pages.cloudflare.com
2. "Create a project" → "Upload assets" → arraste a pasta inteira
3. Atenção: o Cloudflare Pages não lê `.vercelignore` — remova os documentos
   internos da pasta antes de subir, ou configure o ignore equivalente.

## 🎬 O vídeo do hero

O hero exibe vídeo em background, mas **com peso sob controle** — é o item mais
caro da página, e a maior parte do tráfego de franquia chega pelo celular:

| Situação | O que carrega |
|---|---|
| Desktop | `hero-coffee-novo-2.mp4` → `hero-coffee-novo.mp4`, em sequência |
| Celular (< 800px) | só `hero-coffee-novo-2.mp4` (1,8 MB), em **loop nativo** |
| Economia de dados, 2G/3G ou "reduzir movimento" | **nenhum vídeo** — fica a animação CSS de vapor |

O carregamento começa só depois do `load` da página (não disputa banda com o
texto e o CSS) e o vídeo **pausa quando o hero sai da tela**.

Para trocar ou acrescentar vídeos, edite a lista `playlistDesktop` em
`js/script.js`. O primeiro item da lista é o único usado no celular — então ele
deve ser sempre o mais leve.

**Recomendação de compressão** (o vídeo atual é 1920×1080 para uma tela de
375px — dá para cortar ~70% do peso sem perda perceptível no celular):

```bash
ffmpeg -i assets/hero-coffee-novo-2.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 30 -preset slow -an -movflags +faststart assets/hero-coffee-novo-2.mp4
```

## ⚠️ O que falta preencher com dados reais

Todos os pontos estão marcados no código com o comentário
**`DADO REAL NECESSÁRIO`** (busque por esse texto nos arquivos):

| Onde | O que falta | Bloqueia o go-live? |
|---|---|---|
| `js/script.js` → `CONFIG.endpointLead` | Endpoint/webhook do CRM. **Enquanto estiver vazio, o lead não chega em ninguém** — fica só no navegador do candidato | **Sim** |
| `index.html` (footer) e `politica-de-privacidade.html` | CNPJ e razão social da franqueadora | **Sim** |
| `politica-de-privacidade.html` | Revisão jurídica e e-mail real do encarregado (DPO) | **Sim** |
| `index.html`, `robots.txt`, `sitemap.xml` | Domínio final (hoje `www.beencoffee.com.br`) | Sim |
| `index.html` (meta OG) | Imagem de compartilhamento 1200×630 com a marca. Hoje aponta para a foto real do quiosque — funciona, mas não é o corte ideal | Não |
| `index.html` (seção Investimento) | Investimento, payback, royalties e taxa de franquia oficiais da COF | Não |
| `index.html` (seção Próximos passos) | Confirmar com a expansão os prazos de cada etapa | Não |
| `assets/pontos/` | São **renders ilustrativos** — trocar por fotos de unidades reais quando houver (basta substituir o arquivo de mesmo nome) | Não |
| `js/script.js` → `CONFIG.whatsapp` | WhatsApp comercial. Vazio = nenhum botão é criado (melhor que link quebrado) | Não |
| `js/script.js` (chat) | Integração com chat ao vivo (Tawk.to, Crisp, WhatsApp Business etc.) | Não |

## Cache do deploy

Os nomes de arquivo não têm hash de versão e o `vercel.json` cacheia
`/assets/` por 30 dias. **Se você trocar uma imagem ou vídeo mantendo o mesmo
nome, quem já visitou pode continuar vendo a versão antiga.** Para forçar a
atualização, suba com um nome novo e aponte o `index.html` / `script.js`.

## ⚠️ Cuidado ao editar o `vercel.json`

O schema da Vercel usa `additionalProperties: false`: **qualquer chave fora da
lista oficial faz o build inteiro falhar** com "Invalid vercel.json" — e a
Vercel simplesmente mantém no ar a versão anterior, sem quebrar o site. Ou
seja: o deploy falha em silêncio, você só descobre olhando o painel.

Não dá para comentar dentro do arquivo (nem com `//`, nem com uma chave `"//"`).
Anotações sobre a configuração vão neste README.

As regras que bloqueavam os documentos internos por rota saíram do `vercel.json`
porque agora eles nem sobem — ver `.vercelignore`.

Depois de qualquer alteração ali, confirme que o deploy pegou:

```bash
curl -sI https://beencoffee.vercel.app/ | grep -i x-content-type-options
```

Se não retornar nada, o `vercel.json` não está sendo aplicado.

## Checklist do que já está pronto

- ✅ Identidade grafite + laranja neon, Space Grotesk, tom tech-forward
- ✅ Header fixo com blur, opaco no celular (não "flutua" sobre o vídeo)
- ✅ Âncoras do menu param abaixo do header (`scroll-padding` medido por JS)
- ✅ Menu mobile em painel com trava de rolagem, backdrop, Esc e foco de teclado
- ✅ Barra de CTA fixa no rodapé do celular (some quando o cadastro está na tela)
- ✅ Hero com vídeo consciente de peso (ver acima) + poster de fallback
- ✅ Animações de entrada no scroll (Intersection Observer, sem biblioteca)
- ✅ Comparativo quiosque × cafeteria, vitrine de pontos por ambiente
- ✅ Linha do tempo "do cadastro à inauguração, em 5 etapas"
- ✅ Lista do que a franqueadora entrega
- ✅ Simulador financeiro e mapa de potencial
- ✅ Responsivo (verificado em 375px, 768px e 1280px, sem estouro horizontal)
- ✅ SEO: title, description, canonical, Open Graph, Twitter Card, dados
  estruturados de FAQ (rich snippet), `robots.txt` e `sitemap.xml`
- ✅ Acessibilidade: link "pular para o conteúdo", labels em todos os campos,
  foco visível, alvos de toque ≥ 44px, `aria-invalid` nos erros,
  `prefers-reduced-motion` respeitado
- ✅ Validação do formulário com correção ao sair do campo e máscara de telefone
- ✅ FAQ em accordion (9 perguntas)
- ✅ Widget de chat com respostas rápidas do FAQ
- ✅ LGPD: consentimento explícito obrigatório, registrado no payload do lead
- ✅ Cabeçalhos de segurança e cache no `vercel.json`
- ✅ Página 404 na identidade do site

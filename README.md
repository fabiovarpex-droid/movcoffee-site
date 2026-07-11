# Mov Coffee — Site de vendas de franquia

Site de página única (single-page) para captação de candidatos a licenciado dos
quiosques de autoatendimento de café **Mov Coffee**.

Identidade visual: **grafite escuro + laranja neon (#FF7A3D)**, tipografia
Space Grotesk, tom tech-forward. Hero com vídeo em background, animações de
entrada no scroll e cards em glassmorphism.

Feito em **HTML, CSS e JavaScript puros** — sem frameworks, sem build, sem
dependências externas (as animações usam a API nativa Intersection Observer).

## Estrutura dos arquivos

```
index.html                    → página principal (todas as seções)
politica-de-privacidade.html  → página da política de privacidade (LGPD)
css/styles.css                → todos os estilos (mobile-first)
js/script.js                  → header, menu, animações, formulário e chat
assets/favicon.svg            → ícone do site
assets/hero-poster.svg        → poster placeholder do vídeo do hero
assets/hero-coffee.mp4        → (NÃO INCLUÍDO) vídeo do hero — ver abaixo
servidor-local.js             → mini-servidor para testar localmente (não vai para o deploy)
```

## Como rodar localmente

**Jeito mais simples:** dê dois cliques em `index.html` — abre direto no navegador.

**Jeito recomendado** (com servidor local, igual ao ambiente de produção):

```powershell
# dentro da pasta do projeto:
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

### Opção B — Cloudflare Pages

1. Crie uma conta em https://pages.cloudflare.com
2. "Create a project" → "Upload assets" → arraste a pasta inteira
3. Pronto.

## 🎬 O vídeo do hero

O hero foi feito para exibir um vídeo em loop (café sendo preparado, vapor,
retirada no totem). O arquivo **ainda não está incluído**.

1. Grave/consiga o vídeo e **comprima para web** (recomendado: 1080p, H.264,
   sem áudio, poucos MB — quanto menor, mais rápido carrega).
2. Salve como **`assets/hero-coffee.mp4`** (o `index.html` já aponta para esse caminho).
3. Gere um frame estático como **poster** (`assets/hero-poster.jpg`, ~1920×1080)
   e troque o `poster="assets/hero-poster.svg"` no `index.html` por ele.

Enquanto o vídeo `.mp4` não existir, o hero mostra uma **animação de fundo em
CSS** (vapor subindo + brilho quente em movimento) — então ele já parece "vivo",
não fica estático. Quando você colocar o `hero-coffee.mp4`, o JavaScript detecta
que ele tocou e substitui a animação pelo vídeo automaticamente.

O vídeo **não** toca (e a animação é desligada) quando o usuário ativa "reduzir
movimento" no sistema ou está em conexão lenta / economia de dados — nesse caso
aparece o fundo estático, respeitando a acessibilidade.

## ⚠️ O que falta preencher com dados reais

Todos os pontos estão marcados no código com o comentário
**`DADO REAL NECESSÁRIO`** (busque por esse texto nos arquivos):

| Onde | O que falta |
|---|---|
| `assets/hero-coffee.mp4` | Vídeo real do hero (ver seção acima) |
| `index.html` (seção Números) | Investimento, payback, royalties e taxa de franquia oficiais da COF |
| `index.html` (seção Unidades) | ✅ Fotos já colocadas (`assets/unidade-academia.webp`, `unidade-aeroporto.webp`, `unidade-shopping.webp`). Os **textos dos depoimentos** ainda são de exemplo (trocar por frases reais de licenciados quando houver). Para trocar uma foto, basta substituir o arquivo correspondente em `assets/`. |
| `index.html` (footer) | CNPJ e razão social da franqueadora |
| `index.html` (meta tags OG) | Domínio final e imagem de compartilhamento (1200×630px) |
| `js/script.js` (formulário) | Endpoint/webhook do CRM — bloco `fetch` pronto, comentado; basta descomentar e pôr a URL |
| `js/script.js` (chat) | Integração com chat ao vivo (Tawk.to, Crisp, WhatsApp Business etc.) |
| `politica-de-privacidade.html` | Revisão jurídica, CNPJ e e-mail do encarregado (DPO) |

Enquanto o webhook do CRM não é configurado, os cadastros enviados aparecem
apenas no console do navegador (F12 → Console) — **não são salvos em lugar
nenhum**. Configure a integração antes de divulgar o site.

## Checklist do que já está pronto

- ✅ Identidade grafite + laranja neon, Space Grotesk, tom tech-forward
- ✅ Header fixo com blur (glassmorphism) ao rolar
- ✅ Hero com vídeo em background + overlay em gradiente + poster de fallback
- ✅ Animações de entrada no scroll (Intersection Observer, sem biblioteca)
- ✅ Cards de números em glassmorphism
- ✅ Seção de prova social (depoimentos + faixa de pontos)
- ✅ Responsivo (testado em 375px e 1440px)
- ✅ SEO básico: meta title, description e tags Open Graph
- ✅ Acessibilidade: labels em todos os campos, contraste adequado, foco visível, `prefers-reduced-motion` respeitado
- ✅ Validação client-side do formulário (nome, telefone com máscara, e-mail, cidade, capital, experiência)
- ✅ FAQ em accordion (8 perguntas)
- ✅ Widget de chat com respostas rápidas do FAQ
- ✅ Aviso LGPD no formulário e no footer + página de política de privacidade

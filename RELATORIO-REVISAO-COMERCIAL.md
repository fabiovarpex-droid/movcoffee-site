# Relatório — Revisão Comercial B2B do Site Mov Coffee

> Data: 19/07/2026 · Escopo: todas as rotas e menus do repositório.
> Objetivo: transformar o site de peça institucional em máquina de conversão de
> candidatos a licenciado, sem inflar números e sem violar a Lei de Franquias.

---

## 1. Inventário de rotas e navegação (extraído do código)

| Rota | O que é | Situação |
|---|---|---|
| `index.html` | One-page principal (hero → cadastro) | **Reescrita** seção a seção (detalhe abaixo) |
| `simulador.html` | Simulador de plano de negócio + formulário | Motor **intocado**; menu, consentimento e rodapé revisados |
| `mapa-potencial.html` | Mapa de potencial por município | **Mantida**; menu e rodapé revisados; agora linkada contextualmente de "Onde funciona" |
| `politica-de-privacidade.html` | Política LGPD | **Mantida**; entidade "em constituição" no lugar do CNPJ falso |
| `brandbook-movcoffee.html`, `brandbook-movcoffee-artifact.html`, `ebook-movcoffee.html/.pdf`, `modelo-licenciadora-movcoffee.html` | Documentos internos **não linkados** pelo site | **Não publicar** — se o deploy sobe a pasta inteira, essas URLs ficam acessíveis a quem adivinhar o nome. Recomendo movê-los para fora do repositório do site (ou pasta excluída do deploy) |

### Menu (header) — antes → depois

Antes: O modelo · Como funciona · Números · Simulador · Mapa de potencial · Modelos · Dúvidas · CTA
Depois (eixo da jornada de decisão): **A oportunidade · Como funciona · Investimento · Simulador · Dúvidas · CTA "Quero ser licenciado"**

- CTA agora é **persistente também no mobile** (fora do menu hambúrguer, sempre visível no header fixo).
- "Mapa de potencial" saiu do menu principal e virou link contextual na seção "Onde funciona" (e permanece no menu da própria página do mapa). "Modelos" continua na página, sem poluir o menu.

---

## 2. Auditoria seção a seção (index.html)

| # | Seção | Classificação | O que mudou e por quê |
|---|---|---|---|
| 1 | Hero | **Reescrever** | Headline mantida (decisão pendente — 3 opções em §4). Subheadline agora qualifica e prova em 5s: R$ 72 mil, 1 pessoa/turno, ~6 m², multioperação. CTA duplo: candidatar-se (primário) + simular (secundário). 4 números-herói rotulados. |
| 2 | A oportunidade | **Adicionar** (nova) | Mercado + timing + inimigo declarado (fila e café de vending). Sem estatística inventada — texto qualitativo até haver fonte validada (pendência). Fecha com urgência legítima: exclusividade por ponto. |
| 3 | O modelo (quiosque × loja) | **Reescrever** | Cards mantidos + **comparativo visual quiosque × cafeteria tradicional** (investimento, obra, equipe, prazo, risco), com nota de estimativa na coluna da cafeteria. |
| 4 | Como funciona | **Reescrever** | Reenquadrada sob a ótica do franqueado: "operação que você aprende em uma semana", jornada do cliente como prova de simplicidade e multioperação. Corrigido título do passo 1. |
| 5 | Investimento (ex-"Números") | **Reescrever** | Âncora dupla: R$ 72.000 (valor oficial, com "inclui/não inclui") + aporte total R$ 82–91 mil (**rotulado estimativa**: frete, abertura de empresa, capital de giro 3 meses). CTA → simulador ("sem cadastro para simular"). Disclaimer fixo de não-promessa. |
| 6 | Por que Mov (ex-"Vantagens") | **Manter/ajustar** | Bullets mantidos (realocável, suporte técnico, gestão simples, padrão centralizado); rótulo e fechamento reposicionados como quebra do "e se não der certo?". |
| 7 | Suporte e onboarding | **Adicionar** (nova) | "Você abre com a rede, não sozinho": 1 semana presencial + 90 dias remoto + assistência coordenada + calibragem remota. Desrisco explícito. |
| 8 | Onde funciona | **Reescrever** | Educar sem assustar: "o ponto define o resultado" + análise de ponto pela franqueadora + link para o Mapa de potencial. |
| 9 | Modelos de quiosque / prova | **Reescrever** | Fotos mantidas como ilustrativas (honesto). **Novo bloco "Seja fundador da rede"**: enquadramento transparente de rede em implantação que converte a ausência de prova social em vantagem de pioneiro. |
| 10 | FAQ | **Reescrever/ampliar** | 8 → 12 perguntas. Novas: rentabilidade (com disclaimer + link simulador), contrato/**COF com prazo de 10 dias (Lei 13.966/2019)**, realocação do ponto, o que a franqueadora entrega. Resposta de investimento alinhada aos novos números. |
| 11 | Cadastro | **Reescrever** | **Checkbox de consentimento LGPD explícito e obrigatório**, registrado no payload do lead (`consentimentoLgpd` + texto + timestamp). SLA de 2 dias úteis mantido visível. Campos do funil oficial já existiam (faixa de capital, experiência). |
| 12 | Footer | **Reescrever** | CNPJ placeholder `00.000.000/0001-00` **removido de todas as 4 páginas** → "Franqueadora em constituição — razão social e CNPJ serão publicados nesta página". |

### Bug real corrigido de passagem
`.formulario { display: grid }` vencia o atributo `hidden`: após enviar o cadastro, **o formulário continuava na tela junto com a confirmação** (usuário podia reenviar). Corrigido com `[hidden] { display: none !important; }` em `css/styles.css`.

---

## 3. Verificação executada

- Servidor local + navegação em todas as 4 rotas: sem erros de console.
- Formulário testado ponta a ponta: envio bloqueado sem consentimento (mensagem de erro exibida), envio com consentimento gera payload com `consentimentoLgpd: true` e mostra a confirmação (formulário some — bug corrigido).
- Simulador: motor intocado (payback/lucro/margem calculando igual), checkbox e menu novos presentes.
- Mapa: Leaflet carrega normalmente com a correção do `[hidden]`.
- Comparativo: tabela com scroll horizontal próprio, sem estourar o body no mobile.
- Design system: nenhum token novo — só classes novas usando as variáveis existentes.

---

## 4. Decisões pendentes para o Fábio (antes do go-live)

1. **Headline do hero** — manter ou trocar? Opções no território "movimento/performance":
   - A (atual): *"O café é o produto. A liberdade é o negócio."* — forte, mas fala de estilo de vida, não de performance.
   - B: *"Café em movimento. Renda em movimento."* — território da marca, liga produto a resultado.
   - C: *"O quiosque de café que trabalha enquanto você expande."* — foco em multioperação/investidor.
2. **Exibir ou não a margem de 54%** — o simulador mostra 54% no cenário padrão "licenciado opera". Pela regra da rede, a base de comunicação deveria ser o cenário **com colaborador (~36%, payback ~14 m)**. Como o motor da calculadora tem prompt próprio e não foi reaberto aqui, decidir lá: (a) trocar o default para "com colaborador", ou (b) rotular o 54% como "licenciado opera" ao lado do cenário com colaborador.
3. **Prova social real vs. enquadramento de fundador** — o site hoje usa o enquadramento honesto ("rede em implantação / seja fundador"). Existem unidades-piloto com números publicáveis? Se sim, substituir o bloco.
4. **CNPJ / razão social** — regularização da entidade. O placeholder foi removido; sem entidade real não há COF válida nem discurso de franqueadora séria. **Bloqueia o go-live.**
5. **Mecânica de urgência** — o bloco fundador promete "primeira turma". Definir o que a primeira turma leva de fato (condição comercial, prioridade de praça) antes de publicar.
6. **Fontes de dados de mercado** — a seção "A oportunidade" está qualitativa de propósito. Se quiser números (consumo fora do lar, crescimento do setor), validar fonte (ABIC, Euromonitor) e eu insiro com rótulo.
7. **Integração do lead (HubSpot/CRM)** — o `fetch` continua comentado em `js/script.js` aguardando o endpoint. Hoje o lead só aparece no console do navegador — **não é salvo em lugar nenhum**. Também bloqueia o go-live.
8. **E-mail do DPO** na política de privacidade ainda é exemplo.
9. **Terminologia "licenciado" × "franquia/COF"** — o site mistura os dois regimes (e existe um `modelo-licenciadora-movcoffee.html` no repositório). Licenciamento e franquia têm obrigações legais diferentes; o FAQ hoje assume o regime de franquia (COF). Alinhar com o jurídico qual é o regime real e padronizar.

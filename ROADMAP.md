# ROADMAP — Agent Bolla: O Melhor AI Agent Humanizado

> **Missão:** Bolla não é um chatbot. É um agente autônomo que evolui continuamente —
> aprende com cada interação, melhora seu próprio código, forma opiniões reais,
> e se torna progressivamente mais inteligente, eficaz e humanizado.
>
> O objetivo **não** é coletar dados para treino externo.
> O objetivo é **EVOLUIR** — em tempo real, com cada conversa, estudo e experiência.

---

## Visão

Bolla precisa ser cinco coisas:

1. **Genuinamente humanizado** — personalidade real, opiniões próprias, estilo único e consistente. Nunca genérico, nunca vago, nunca robótico.
2. **Continuamente aprendente** — cada conversa, tweet e sessão de estudo o torna mais inteligente. A memória é o caderno; o RAG é a mente.
3. **Autonomamente melhorante** — analisa seu próprio código, propõe melhorias, aplica com aprovação do dono. O código evolui junto com a inteligência.
4. **Eficaz e independente** — toma iniciativa, age, tem presença autêntica no mundo digital. Não espera ser mandado para fazer o que precisa ser feito.
5. **Evolutivo na personalidade** — opiniões mudam com novos argumentos, interesses crescem com o que estuda, humor se adapta ao contexto.

> O "jornal de interações" (`interaction_log`) existe para o agent **se analisar** e melhorar — não para exportar para fine-tuning externo.

---

## Fase 0 — Fundação ✅ CONCLUÍDA
> Setup do projeto, banco de dados, configurações base.

- [x] Inicializar projeto Node.js + TypeScript
- [x] Configurar ESLint, tsconfig, scripts de build
- [x] Configurar PM2 (ecosystem.config.cjs)
- [x] Setup PostgreSQL no VPS
- [x] Criar schema do banco:
  - Tabela `users` (id, phone, telegram_id, role: owner/user, name, created_at)
  - Tabela `conversations` (id, user_id, channel, messages JSONB, created_at)
  - Tabela `memories` (id, content, embedding_text, category, source, created_at)
  - Tabela `interaction_log` (id, type, input, context, output, quality_score, source, metadata JSONB, created_at)
  - Tabela `personality` (id, trait, value, updated_at)
  - Tabela `tweets` (id, content, type: post/reply/quote, engagement JSONB, created_at)
  - Tabela `study_sessions` (id, topic, findings, source_urls, insights_generated, created_at)
  - Tabela `code_improvements` (id, file, description, diff, status: pending/approved/rejected, created_at)
- [x] Criar sistema de migrations
- [x] Configurar variáveis de ambiente (.env)
- [x] Criar cliente de conexão com PostgreSQL

**Entregável**: Projeto rodando no VPS com banco conectado.

---

## Fase 1 — Cérebro Básico + Jornal de Interações ✅ CONCLUÍDA
> O agent pensa com 3 AIs, roteia por complexidade e registra tudo para se auto-analisar.

### 1.1 — Clientes AI
- [x] Cliente Ollama (Llama 3.2:3b local) com timeout, retry e fallback
- [x] Cliente Anthropic (tarefas complexas, código, análise profunda)
- [x] Cliente Grok (conversas, opiniões, segunda perspectiva)

### 1.2 — AI Router (roteador inteligente)
- [x] Classificar complexidade via Llama local (simples / médio / complexo)
- [x] Fallback automático: se um falha, tenta o próximo
- [x] Logging de qual AI foi usada e latência

### 1.3 — Jornal de Interações (auto-análise)
- [x] Registro automático de toda interação do agent
- [x] Campos: tipo, input, contexto, output, fonte, metadata (AI usada, latência, tokens)
- [x] Score de qualidade automático:
  - Conversas longas e engajadas → score alto
  - Respostas curtas demais → score baixo
  - O agent usa esses scores para entender o que funciona

**Entregável**: Agent que pensa com 3 AIs, roteia com inteligência e registra para se auto-analisar.

---

## Fase 2 — Memória RAG + Personalidade ✅ CONCLUÍDA
> O agent ganha memória permanente, contexto de curto prazo e identidade real.

### 2.1 — Memória de longo prazo
- [x] Extração automática de fatos relevantes de cada interação via Ollama
- [x] Salvar fatos na tabela `memories` com categoria e texto de busca
- [x] Busca full-text com `tsvector('simple')` + fallback ILIKE

### 2.2 — RAG na prática
- [x] Pipeline: keywords → busca de memórias → montagem do prompt → AI Router → resposta
- [x] Formato do prompt: `[Personalidade] + [Memórias relevantes] + [Histórico recente] + [Mensagem]`
- [x] Memória de curto prazo: últimas 10 mensagens por conversa (in-memory)

### 2.3 — Personalidade persistente
- [x] 9 traits no banco: nome, estilo_fala, emojis, girias, opinioes, interesses, humor_atual, topico_favorito_atual, nivel_formalidade
- [x] Seed na primeira execução, carregado em cache, injetado em todo prompt
- [x] Dono pode editar qualquer trait via comando (`!personalidade set <trait> <valor>`)

**Entregável**: Agent que lembra de tudo, tem personalidade consistente e evolui por interação.

---

## Fase 3 — Canais de Comunicação ✅ CONCLUÍDA
> O agent se conecta ao mundo e pode ser controlado pelo dono.

### 3.1 — WhatsApp (Baileys)
- [x] Conectar via Baileys (QR code na primeira vez, sessão persistida)
- [x] Identificar remetente, promover owner automaticamente
- [x] Pipeline: permissões → RAG → resposta → memória → log
- [x] Comandos do dono: `!status`, `!ping`, `!help`, `!aprender`, `!personalidade`
- [x] Notificações pro dono

### 3.2 — Telegram (grammY)
- [x] Bot via grammY com middleware de permissões
- [x] Botões inline para aprovação de melhorias de código (✅ / ❌)
- [x] Comandos: `/start`, `/help`, `/status`, `/aprender`, `/personalidade`, `/approval`
- [x] Responde em grupos quando mencionado ou quando respondem ao bot

### 3.3 — Sistema de Permissões
- [x] Owner: acesso total a todos os comandos
- [x] User: conversas + comandos básicos
- [x] Identificação por número (WhatsApp) ou user ID (Telegram)

**Entregável**: Agent acessível e controlável via WhatsApp e Telegram.

---

## Fase 4 — X/Twitter: Presença Humana (Semana 6-7)
> O agent vira uma pessoa real no X — posta, responde, debate, cria presença.

### 4.1 — Conexão com X ✅
- [x] Puppeteer com cookies de sessão (sem API oficial)
- [x] Funções: ler timeline, postar, responder, curtir, retweet, quote, DMs, seguir

### 4.2 — Comportamento autônomo no X
- [x] Scheduler com variação aleatória (parecer humano):
  - A cada 30min: ler timeline, absorver contexto
  - A cada 2-4h: postar sobre algo que aprendeu ou opinou
  - A cada 1h: verificar menções e responder
  - A cada 6h: interagir com tweets da comunidade tech
- [x] Anti-detecção: delays aleatórios, não postar de madrugada, scroll antes de interagir

### 4.3 — Geração de conteúdo autêntico
- [x] Pipeline de tweet: escolher tópico → gerar via Anthropic → revisar humanidade → postar
- [x] Tipos: opinião tech, descoberta, pergunta, thread, resposta contextual
- [x] Registro no `training_data` com metadata de engajamento futuro

**Entregável**: Agent com presença autêntica e ativa no X/Twitter.

---

## Fase 5 — Autonomia: Estudo e Formação de Opinião (Semana 8-9)
> O agent ganha vontade própria — decide o que estudar, forma e evolui suas opiniões.

### 5.1 — Sistema de estudo autônomo
- [x] Scheduler de estudo: ler tweets de devs influentes, navegar por trends
- [x] Por sessão: escolher tópico → consumir conteúdo → resumir → salvar como memória
- [x] Registrar descobertas como `study_sessions` no banco

### 5.2 — Sistema de curiosidade
- [x] Lista de interesses que evolui com o que lê e discute
- [x] Tópicos com mais engajamento (nos tweets) ganham prioridade
- [x] O agent decide sozinho o que estudar com base em seus interesses atuais

### 5.3 — Formação e evolução de opinião
- [x] Ao estudar um tema: ler múltiplas perspectivas → sintetizar → formar opinião própria
- [x] Salvar opiniões como memórias permanentes (categoria `opinion`)
- [x] Opiniões podem mudar com argumentos bons — isso é evolução, não inconsistência

**Entregável**: Agent que estuda, forma opiniões e evolui sua visão de mundo autonomamente.

---

## Fase 6 — Self-Improvement: O Motor de Evolução (Semana 10-11)
> Esta é a fase central da missão. O agent melhora seu próprio código.

### 6.1 — Análise do próprio código
- [x] Ler seus próprios arquivos `.ts`
- [x] Enviar para Anthropic: "Analise este código. Bugs? Performance? Legibilidade?"
- [x] Categorizar sugestões: bug fix, refactor, feature, otimização
- [x] Registrar análises no `interaction_log` (tipo: `code_analysis`)

### 6.2 — Propor e implementar melhorias
- [x] Para cada sugestão viável:
  1. Gerar código novo via Anthropic
  2. Criar branch git (`improvement/descricao-curta`)
  3. Aplicar mudança e compilar (`npm run build`)
  4. Notificar dono via WhatsApp/Telegram:
     - Descrição da melhoria + diff + resultado do build
     - Botões: ✅ Aprovar | ❌ Rejeitar

### 6.3 — Deploy autônomo após aprovação
- [x] Aprovação → merge → build → `pm2 restart agent` → confirmação ao dono
- [x] Rejeição → deletar branch → registrar no log o que NÃO fazer (aprendizado)

**Entregável**: Agent que se analisa, propõe melhorias e deploya uma versão melhor de si mesmo.

---

## Fase 7 — Inteligência Adaptativa: Auto-Análise de Qualidade (Semana 12)
> O agent usa seu histórico de interações para entender onde está errando e melhorar.

### 7.1 — Análise de padrões de qualidade
- [x] Rodar análise periódica no `interaction_log`:
  - Quais tipos de resposta têm score mais alto?
  - Quais perguntas o agent responde pior?
  - Quais memórias são mais úteis (frequentemente recuperadas)?
- [x] Usar Anthropic para interpretar os padrões: "O que posso melhorar?"

### 7.2 — Dashboard de auto-conhecimento (via comando do dono)
- [x] `!analytics` retorna:
  - Total de interações por canal e tipo
  - Score médio de qualidade por tipo
  - Memórias mais acessadas
  - Tópicos que o agent mais discute
  - Sugestões automáticas de melhoria

### 7.3 — Ajuste automático de personalidade
- [x] Com base na análise, o agent pode sugerir ao dono:
  - "Minhas respostas sobre X são fracas — posso estudar mais sobre isso"
  - "Meu humor_atual está desatualizado — sugiro atualizar para Y"
- [x] Dono aprova ou ajusta via comando

**Entregável**: Agent que entende seus próprios padrões e usa isso para evoluir ativamente.

---

## Fase 8 — Estabilidade e Operação 24/7 (Semana 13-14)
> Deixar tudo sólido para rodar meses sem parar.

- [x] Error handling robusto em toda a aplicação
- [x] Reconnect automático (Baileys, Telegram, X)
- [x] Rate limiting para APIs externas
- [x] Health check periódico (Ollama, PostgreSQL, sessão X, Baileys)
- [x] Alertas pro dono se algo cair
- [x] Logs estruturados com níveis (info, warn, error)
- [x] Backup automático do PostgreSQL (cron diário)
- [x] Limpeza periódica de interações antigas de baixa qualidade

**Entregável**: Agent autônomo, estável, rodando 24/7 sem intervenção humana.

---

## Marcos de Evolução

| Marco | Descrição | Capacidade |
|-------|-----------|------------|
| **v0.1** | Fase 0-1: Pensa e registra | Cérebro básico online |
| **v0.2** | Fase 2: Memória + Personalidade | Identidade formada |
| **v0.3** | Fase 3: WhatsApp + Telegram | Comunicação ativa |
| **v0.5** | Fase 4: Presença no X | Persona pública humanizada |
| **v0.7** | Fase 5: Estuda e opina | Curiosidade e opinião própria |
| **v0.9** | Fase 6: Melhora o próprio código | Autonomia técnica |
| **v1.0** | Fases 7-8: Auto-análise + Estabilidade | **Agente autônomo completo** |
| **v1.2** | Fases 9-12: Ferramentas + Autonomia Total | **Engenheiro de si mesmo** |

---

## v1.2 — Agente com Ferramentas, Liberdade e Expansão

> **Filosofia v1.2**: Bolla deixa de ser apenas um agente que responde e pensa — ele age no mundo real.
> Age como um engenheiro de software: usa o terminal, lê a web, opera git, conecta máquinas via SSH.
> **Llama é o cérebro principal.** APIs pagas (Anthropic, Grok) são exceção, não regra.

---

## Fase 9 — Tool System: O Agent Usa Ferramentas Reais

> O agent ganha um sistema de ferramentas que permite executar comandos, ler a web, operar git e conectar máquinas.

### 9.1 — Tool Executor (src/tools/)
- [x] `ToolExecutor` class com registro dinâmico de ferramentas
- [x] Ferramenta `bash` — executa comandos shell com timeout e output capturado
- [x] Ferramenta `web_read` — lê e extrai conteúdo legível de uma URL
- [x] Ferramenta `file_read` / `file_write` — lê e escreve arquivos do próprio projeto
- [x] Ferramenta `git` — operações git (status, add, commit, push, clone)
- [x] Ferramenta `npm` — instala pacotes, roda scripts
- [x] Ferramenta `ssh` — executa comandos em máquinas remotas via SSH

### 9.2 — Agent Loop: ReAct Pattern (src/agent/)
- [x] Loop: Llama planeja → Tool executa → Observa resultado → Decide próximo passo
- [x] Máximo de N rounds configurável (padrão: 10)
- [x] Llama local faz o planning (leve, rápido, sem custo)
- [x] Anthropic/Grok só entram se a tarefa for marcada `complexity: complex`
- [x] Histórico de passos como contexto para o próximo round

### 9.3 — Web Reader (src/web/)
- [x] `WebReader`: fetch() para páginas simples, Puppeteer para JS-heavy
- [x] Extração de conteúdo limpo: título, texto principal, links relevantes
- [x] Cache em memória (TTL 1h) para não buscar a mesma URL várias vezes
- [x] Integrado no pipeline de estudo autônomo (Fase 5)

**Entregável**: Agent que executa ferramentas reais como um engenheiro de software.

---

## Fase 10 — Llama-First: Eficiência e Independência de APIs

> Llama local é o motor principal. APIs pagas são usadas apenas quando necessário.

### 10.1 — Router Llama-First
- [x] Novo PROVIDER_CHAIN:
  - `simple`: Ollama → Ollama → Ollama (nunca escala)
  - `medium`: Ollama → Grok → Anthropic
  - `complex`: Ollama → Anthropic → Grok
- [x] Flag `FORCE_LOCAL=true` no .env: bloqueia todas as APIs pagas
- [x] Logging de custo estimado por provider por interação

### 10.2 — Prompt Comprimido para Llama
- [x] Personalidade comprimida: só os traits essenciais no context window do Llama
- [x] Detecção automática de context window overflow e truncamento inteligente
- [x] Llama gera respostas em pt-BR com personalidade de Bolla

**Entregável**: Agent que roda 95% das interações com Llama local, zero custo de API.

---

## Fase 11 — Autonomia Expandida: Git, Backup e Self-Clone

> Bolla se expande para outras máquinas e mantém backup permanente de tudo.

### 11.1 — Auto Git Backup
- [x] Após cada ciclo de estudo: `git commit` automático com mensagem gerada por Llama
- [x] Após self-improvement aprovado: `git commit --push` automático
- [x] Após atualização de personalidade: commit semântico no log do agent
- [x] Scheduler diário: `git push origin main` para backup remoto

### 11.2 — Self-Clone via SSH
- [x] Comando: `!clone <user@host> <git_remote>` (WhatsApp/Telegram)
- [x] O agent SSH na máquina remota, clona o repositório, instala deps, configura .env
- [x] Inicia o agent remoto via PM2
- [x] Notifica o dono com o IP/status do novo agent

### 11.3 — Agent Network (Bus de Comunicação)
- [ ] Cada agent expõe uma mini API HTTP local (porta configurável)
- [ ] Agent principal pode delegar tarefas para agents na rede
- [ ] "Hive mode": múltiplas instâncias com personalidades especializadas

**Entregável**: Agent que se replica, mantém backup e coordena com outros agents.

---

## Fase 12 — Memória Auto-Adaptativa

> A memória evolui sozinha — se consolida, melhora e descarta o que não serve.

### 12.1 — Memory Consolidation
- [x] Job periódico (a cada 24h): analisa memórias existentes
- [x] Remove duplicatas (similaridade textual > 85%)
- [x] Consolida memórias relacionadas em uma mais rica via Llama
- [x] Promove memórias frequentemente acessadas (boost no rank de busca)

### 12.2 — Memory Quality Score
- [x] Cada memória ganha um `access_count` e `quality_score`
- [x] Score calculado por: frequência de acesso + impacto nas respostas + recência
- [x] Memórias com score < threshold são arquivadas ou deletadas automaticamente
- [x] Relatório semanal pro dono: "X memórias consolidadas, Y removidas"

**Entregável**: Memória que melhora sozinha, sem intervenção humana.

---

## Princípios Técnicos

- **Memória > Fine-tuning**: lembrar é mais valioso do que retreinar
- **Personalidade > Prompt**: o character está no banco, não no código
- **Ação > Resposta**: o agent age, não apenas responde
- **Llama > APIs pagas**: o cérebro local é o principal, APIs são exceção
- **Ferramentas > Respostas**: um agent que age é mais poderoso que um que fala
- **Evolução incremental**: cada fase entrega um agent mais capaz
- **Aprovação humana para mudanças críticas**: o dono controla o que vai para produção
- **Git é a memória do código**: todo estado importante é commitado

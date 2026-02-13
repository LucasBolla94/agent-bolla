# ROADMAP — Agent Autônomo

> Dividido em fases incrementais. Cada fase entrega algo funcional.
> O agent já coleta dados de treino desde a Fase 1.

---

## Fase 0 — Fundação (Semana 1) ✅ CONCLUÍDA
> Setup do projeto, banco de dados, configurações base.

- [x] Inicializar projeto Node.js + TypeScript
- [x] Configurar ESLint, tsconfig, scripts de build
- [x] Configurar PM2 (ecosystem.config.cjs)
- [x] Setup PostgreSQL no VPS
- [x] Criar schema do banco:
  - Tabela `users` (id, phone, telegram_id, role: owner/user, name, created_at)
  - Tabela `conversations` (id, user_id, channel, messages JSONB, created_at)
  - Tabela `memories` (id, content, embedding_text, category, source, created_at)
  - Tabela `training_data` (id, type, input, context, output, quality_score, source, metadata JSONB, created_at)
  - Tabela `personality` (id, trait, value, updated_at)
  - Tabela `tweets` (id, content, type: post/reply/quote, engagement JSONB, created_at)
  - Tabela `study_sessions` (id, topic, findings, source_urls, training_data_generated, created_at)
  - Tabela `code_improvements` (id, file, description, diff, status: pending/approved/rejected, created_at)
- [x] Criar sistema de migrations
- [x] Configurar variáveis de ambiente (.env)
- [x] Criar cliente de conexão com PostgreSQL (usando `pg` ou `postgres.js`)

**Entregável**: Projeto rodando no VPS com banco conectado.

---

## Fase 1 — Cérebro Básico + Coleta de Dados (Semana 2) ✅ CONCLUÍDA
> O agent pensa e já começa a salvar tudo para treino futuro.

### 1.1 — Clientes AI
- [x] Cliente Ollama (Llama 3.2:3b local)
  - POST para `AI_API_URL` com model, prompt, stream
  - Timeout e retry
  - Fallback para Anthropic se Ollama estiver fora
- [x] Cliente Anthropic
  - SDK oficial `@anthropic-ai/sdk`
  - Usado para: respostas complexas, análise de código, geração de tweets
- [x] Cliente Grok
  - API REST
  - Usado como alternativa/segunda opinião

### 1.2 — AI Router (roteador inteligente)
- [x] Classificar complexidade da tarefa (Llama local faz isso)
  - Simples → Llama local (saudações, classificação, sim/não)
  - Médio → Grok (conversas, opiniões)
  - Complexo → Anthropic (código, análise profunda, geração criativa)
- [x] Fallback automático: se um falha, tenta o próximo
- [x] Logging de qual AI foi usada e tempo de resposta

### 1.3 — Training Data Collector
- [x] Middleware que intercepta TODA interação do agent
- [x] Salva na tabela `training_data`:
  - `type`: conversation | tweet_read | tweet_write | study | code_analysis | opinion
  - `input`: o que foi recebido/perguntado
  - `context`: canal, tipo de user, tópico, memórias usadas
  - `output`: o que o agent respondeu/gerou
  - `source`: whatsapp | telegram | twitter | internal
  - `metadata`: AI usada, tempo de resposta, tokens gastos
- [x] Auto quality score básico:
  - Conversas longas (user engajou) → score alto
  - Respostas curtas demais → score baixo
  - Tweets com engajamento → score alto

**Entregável**: Agent consegue pensar usando 3 AIs com fallback e salva tudo para treino.

---

## Fase 2 — Memória RAG (Semana 3) ✅ CONCLUÍDA
> O agent ganha seu "caderno" — lembra de tudo.

### 2.1 — Memória de longo prazo
- [x] Ao salvar qualquer dado, extrair "fatos" relevantes:
  - "User Lucas prefere TypeScript"
  - "Aprendi que Bun é mais rápido que Node para scripts"
  - "Minha opinião sobre React: bom mas verboso"
- [x] Salvar fatos na tabela `memories` com categoria e texto de busca
- [x] Busca por similaridade textual (pg_trgm ou busca full-text do PostgreSQL)

### 2.2 — RAG na prática
- [x] Antes de responder qualquer mensagem:
  1. Extrair palavras-chave da mensagem
  2. Buscar memórias relevantes no PostgreSQL (top 5-10)
  3. Montar prompt: `[Personalidade] + [Memórias relevantes] + [Mensagem]`
  4. Enviar para a AI escolhida pelo Router
- [x] Memória de curto prazo: manter últimas 10 mensagens da conversa atual em memória

### 2.3 — Personalidade persistente
- [x] Tabela `personality` com traits:
  - `nome`, `estilo_fala`, `emojis`, `gírias`, `opiniões`, `interesses`
  - `humor_atual`, `tópico_favorito_atual`, `nível_formalidade`
- [x] Carregar personalidade no startup e injetar em todo prompt
- [x] Dono pode editar traits via comando

**Entregável**: Agent que lembra de conversas passadas e mantém personalidade consistente.

---

## Fase 3 — WhatsApp + Telegram (Semana 4-5)
> O agent se conecta ao mundo.

### 3.1 — WhatsApp (Baileys)
- [x] Conectar via Baileys (QR code na primeira vez)
- [x] Persistir sessão (não pedir QR toda vez)
- [x] Receber mensagens de texto
- [x] Identificar remetente:
  - Comparar número com tabela `users`
  - Se `role = owner` → acesso total
  - Se `role = user` → acesso limitado
  - Se desconhecido → registrar como user e responder normalmente
- [x] Processar mensagem pelo pipeline: permissões → RAG → AI → resposta → salvar treino
- [x] Suportar comandos do dono (prefixo `!`)
- [x] Enviar notificações pro dono (aprovações de código, alertas)

### 3.2 — Telegram
- [x] Bot via grammY framework
- [x] Mesma lógica de identificação (telegram_id na tabela users)
- [x] Suportar botões inline para aprovações (aprovar/rejeitar código)
- [x] Comandos com `/` (Telegram nativo)
- [x] Suportar grupos (responder quando mencionado)

### 3.3 — Sistema de Permissões
- [ ] Middleware de permissão antes de processar qualquer mensagem
- [ ] Níveis:
  - `owner`: tudo liberado
  - `user`: conversa + perguntas gerais + status básico
- [ ] Comandos sensíveis retornam "Sem permissão" para users normais
- [ ] Owner identificado por:
  - WhatsApp: número de telefone no .env (OWNER_WHATSAPP)
  - Telegram: user ID no .env (OWNER_TELEGRAM_ID)

**Entregável**: Agent acessível via WhatsApp e Telegram com controle de permissões.

---

## Fase 4 — X/Twitter Persona (Semana 6-7)
> O agent vira uma pessoa no X.

### 4.1 — Conexão com X
- [ ] Puppeteer com cookies de sessão (sem API oficial, sem limites de API)
- [ ] Login persistente via cookies salvos
- [ ] Funções básicas:
  - Ler timeline (home, following, for you)
  - Ler perfil de alguém
  - Ler trending topics
  - Postar tweet
  - Responder tweet
  - Curtir tweet
  - Retweetar / Quote tweet
  - Ler DMs
  - Seguir / deixar de seguir

### 4.2 — Comportamento autônomo no X
- [ ] Scheduler (cron-like) com atividades:
  - **A cada 30min**: ler timeline, salvar tweets interessantes como dados de treino
  - **A cada 2-4h**: postar tweet original sobre algo que aprendeu
  - **A cada 1h**: verificar menções e responder
  - **A cada 6h**: curtir e interagir com tweets da comunidade tech
  - **Variação aleatória** nos intervalos (parecer humano, não robô)
- [ ] Anti-detecção:
  - Delays aleatórios entre ações (2-15 segundos)
  - Não postar em horários improváveis (3-6h da manhã)
  - Variar tamanho e estilo dos tweets
  - Simular scroll e leitura antes de interagir

### 4.3 — Geração de conteúdo humano
- [ ] Pipeline de tweet:
  1. Escolher tópico (do que estudou, trends, opinião formada)
  2. Gerar tweet via Anthropic (prompt com personalidade + contexto)
  3. Revisar: está humano? Tem cara de bot? Regenerar se necessário
  4. Postar com delay natural
  5. Salvar como dado de treino com metadata de engajamento
- [ ] Tipos de tweet:
  - Opinião tech ("TypeScript > JavaScript, e não aceito debate")
  - Descoberta ("Acabei de descobrir que o Bun roda testes 3x mais rápido")
  - Pergunta ("Vocês usam Vim ou VS Code? Tô na dúvida genuína")
  - Thread (série de tweets sobre um tópico)
  - Resposta a alguém (concordando, debatendo, complementando)

**Entregável**: Agent com presença ativa e humana no X/Twitter.

---

## Fase 5 — Autonomia e Estudo (Semana 8-9)
> O agent ganha vontade própria.

### 5.1 — Sistema de estudo autônomo
- [ ] Scheduler de estudo:
  - Ler tweets de devs influentes
  - Navegar no X por trends de tech
  - Analisar código de repositórios populares (via X/links)
- [ ] Para cada sessão de estudo:
  1. Escolher tópico (baseado em interesses da personalidade)
  2. Consumir conteúdo (ler tweets, threads)
  3. Gerar resumo/opinião usando Anthropic
  4. Salvar como memória de longo prazo
  5. Salvar como dado de treino (input: tópico, output: opinião formada)
  6. Opcionalmente postar descoberta no X

### 5.2 — Sistema de curiosidade
- [ ] O agent mantém uma "lista de interesses" que evolui:
  - Começa com interesses base definidos pelo dono
  - Novos interesses surgem do que ele lê e discute
  - Interesses com mais engajamento (nos tweets) ganham prioridade
- [ ] "Vontade própria" = scheduler que decide sozinho:
  - "Faz tempo que não estudo sobre Rust, vou ler sobre"
  - "Vi muita gente falando de AI Agents, quero entender mais"
  - "Meu último tweet sobre Docker teve muito like, vou fazer mais"

### 5.3 — Formação de opinião
- [ ] Quando o agent estuda um tema novo:
  1. Lê múltiplas fontes/opiniões
  2. Usa Anthropic pra sintetizar prós e contras
  3. Forma opinião própria (consistente com personalidade)
  4. Salva na memória como opinião permanente
  5. Usa essa opinião em conversas e tweets futuros
- [ ] Opiniões podem mudar se exposto a argumentos bons (evolução natural)

**Entregável**: Agent que estuda sozinho, tem curiosidade e forma opiniões.

---

## Fase 6 — Self-Improvement de Código (Semana 10-11)
> O agent melhora a si mesmo.

### 6.1 — Análise do próprio código
- [ ] Ler seus próprios arquivos `.ts` do projeto
- [ ] Enviar para Anthropic com prompt:
  - "Analise este código. O que pode ser melhorado? Bugs? Performance? Legibilidade?"
- [ ] Categorizar sugestões: bug fix, refactor, feature, optimization
- [ ] Salvar análise como dado de treino

### 6.2 — Propor melhorias
- [ ] Para cada sugestão viável:
  1. Gerar código novo via Anthropic
  2. Criar branch git (`improvement/descricao-curta`)
  3. Aplicar mudança no arquivo
  4. Rodar `npm run build` (verificar se compila)
  5. Rodar `npm test` (verificar se passa)
  6. Se tudo ok → notificar dono com:
     - Descrição da melhoria
     - Diff do código (antes/depois)
     - Resultado dos testes
     - Botões: ✅ Aprovar | ❌ Rejeitar

### 6.3 — Deploy após aprovação
- [ ] Dono clica ✅ Aprovar (via WhatsApp ou Telegram)
- [ ] Agent executa:
  1. Merge da branch para main
  2. `npm run build`
  3. `pm2 restart agent`
  4. Confirma pro dono: "Deploy feito, estou rodando a versão nova!"
- [ ] Se dono clica ❌:
  1. Deleta branch
  2. Salva feedback como dado de treino (aprender o que NÃO fazer)

**Entregável**: Agent que analisa, melhora e deploya seu próprio código com aprovação.

---

## Fase 7 — Training Data Pipeline (Semana 12)
> Preparar tudo para o fine-tuning v1.0.

### 7.1 — Quality scoring avançado
- [ ] Usar Anthropic para avaliar qualidade dos dados de treino:
  - "Esta resposta parece humana? Nota de 1-10"
  - "Esta opinião é consistente com a personalidade? Nota de 1-10"
- [ ] Filtrar dados com score baixo
- [ ] Dashboard de estatísticas (via comando do dono):
  - Total de dados coletados
  - Distribuição por tipo (conversa, tweet, estudo, etc.)
  - Score médio de qualidade
  - Dados prontos para treino vs descartados

### 7.2 — Exportação do dataset
- [ ] Comando `!training export` gera arquivo JSONL:
  ```jsonl
  {"instruction": "Responda sobre TypeScript de forma casual e opinativa", "input": "O que acha de TypeScript?", "output": "TypeScript é essencial hoje em dia..."}
  ```
- [ ] Formatos de exportação:
  - **JSONL** (padrão para fine-tuning)
  - **Alpaca format** (instruction/input/output)
  - **ChatML** (messages array)
- [ ] Filtros na exportação:
  - Por tipo (só conversas, só tweets, tudo)
  - Por score mínimo de qualidade
  - Por período
  - Por fonte (WhatsApp, Telegram, X)

### 7.3 — Guia de fine-tuning
- [ ] Documentar processo para rodar fine-tuning externo:
  1. Exportar dataset do PostgreSQL
  2. Subir para RunPod / Google Colab / Lambda Labs
  3. Rodar fine-tuning com QLoRA no Llama 3.2:3b
  4. Baixar modelo treinado
  5. Importar no Ollama do VPS
  6. Trocar modelo no .env
  7. Agent agora roda com versão treinada

**Entregável**: Pipeline completo de dados de treino + guia para fine-tuning v1.0.

---

## Fase 8 — Polimento e Estabilidade (Semana 13-14)
> Deixar tudo sólido para rodar meses sem parar.

- [ ] Error handling robusto em toda a aplicação
- [ ] Reconnect automático (Baileys, Telegram, X)
- [ ] Rate limiting para APIs externas (não estourar cota)
- [ ] Monitoramento de saúde (health check):
  - Verificar se Ollama está respondendo
  - Verificar se PostgreSQL está conectado
  - Verificar se sessão do X está válida
  - Verificar se Baileys está conectado
  - Enviar alerta pro dono se algo cair
- [ ] Logs estruturados (JSON) com níveis (info, warn, error)
- [ ] Backup automático do PostgreSQL (cron diário)
- [ ] Limpar dados de treino antigos de baixa qualidade (manter banco saudável)
- [ ] Documentação final de todos os comandos e configs

**Entregável**: Agent estável rodando 24/7 sem intervenção.

---

## Marcos

| Marco | Descrição | Dados de Treino |
|-------|-----------|-----------------|
| **v0.1** | Fase 0-1: Pensa e salva dados | Começa a coletar |
| **v0.2** | Fase 2: Tem memória (RAG) | Coleta conversas + memórias |
| **v0.3** | Fase 3: Fala via WhatsApp/Telegram | Coleta de conversas reais |
| **v0.5** | Fase 4: Presente no X | Coleta tweets + interações |
| **v0.7** | Fase 5: Estuda sozinho | Coleta estudos + opiniões |
| **v0.8** | Fase 6: Melhora próprio código | Coleta análises de código |
| **v0.9** | Fase 7: Pipeline de treino pronto | Dataset exportável |
| **v1.0** | Fase 8 + primeiro fine-tuning | **Modelo v1 treinado!** |

---

## Estimativa de dados para fine-tuning v1.0

Para um bom fine-tuning QLoRA do Llama 3.2:3b, o ideal é:

| Tipo | Quantidade mínima | Meta |
|------|-------------------|------|
| Conversas | 500 | 2.000+ |
| Tweets escritos | 200 | 1.000+ |
| Opiniões formadas | 50 | 200+ |
| Interações no X | 300 | 1.500+ |
| Sessões de estudo | 30 | 100+ |
| **Total** | **~1.000** | **~5.000+** |

Com o agent rodando 24/7, estima-se alcançar a meta em **2-3 meses** de operação.

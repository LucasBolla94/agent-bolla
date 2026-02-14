# Melhoramento.md — Plano de Evolução do Agent Bolla

Inspirado na arquitetura do **OpenClaw** (o agente autônomo open-source mais crescido de 2026).
Cada etapa mantém o serviço 100% funcional. Nunca derrubamos o bot para fazer uma melhoria.

---

## Diagnóstico do Estado Atual

### O que já funciona bem
- Pipeline RAG com memórias em PostgreSQL
- Personalidade dinâmica persistida e editável pelo owner
- Training data collector automático em todas as interações
- WhatsApp funcional com reconexão automática
- Indicador de digitação (typing) enquanto processa
- Classificação de complexidade local (0ms, sem chamada extra ao modelo)

### Problemas que este plano resolve

| Problema | Impacto | Etapa que resolve |
|---|---|---|
| Personalidade fragmentada em traits de BD | Respostas genéricas, sem "alma" coesa | Etapa 1 |
| Prompt sem orçamento de tokens | Prompts grandes = modelo lento | Etapa 2 |
| Router tenta providers não configurados | Latência extra ao falhar | Etapa 3 |
| Emoções como string estática | Tom não muda com o contexto | Etapa 4 |
| Memórias duplicadas se acumulam | Contexto poluído, buscas imprecisas | Etapa 5 |
| Modelo retorna markdown no WhatsApp | `**negrito**` aparece como texto literal | Etapa 6 |

---

## Regras de Desenvolvimento (NÃO NEGOCIÁVEIS)

1. `npm run build` antes de qualquer restart do processo
2. Testar com `!ping` e uma mensagem simples após cada etapa
3. Cada etapa tem rollback claro descrito abaixo
4. Mudanças aditivas primeiro — nunca deletar antes de confirmar que o novo funciona
5. Uma etapa por vez — nunca misturar duas etapas no mesmo deploy

---

## Etapa 1 — Soul.md: A Alma do Agente

**Status: [ ] Pendente**

### Por que
A personalidade atual são fragmentos de configuração (`nome`, `estilo_fala`, `humor_atual`...) armazenados em linhas de banco de dados. O modelo lê isso como dados, não como identidade.

O OpenClaw provou que um arquivo Markdown narrativo — uma "alma" coesa — gera respostas infinitamente mais naturais e consistentes. O model lê o Soul.md como um ser humano leria uma carta de apresentação real, não como um formulário de configuração.

### O que muda

**Arquivo novo**: `data/soul.md`
- Identidade, visão de mundo, contradições reais, posicionamentos genuínos
- Estado emocional atual (separado dos traits operacionais)
- Escrito em prosa, não em formato chave=valor
- Editável diretamente pelo owner a qualquer momento
- Recarregado automaticamente a cada mensagem (sem restart)

**Arquivo modificado**: `src/personality/service.ts`
- Novo método `loadSoulFile(): Promise<string>` — lê `data/soul.md` do disco
- Novo método `buildSoulContext(): Promise<string>` — retorna soul + traits como um bloco único
- Se `soul.md` não existir: gera automaticamente a partir dos traits atuais do BD

**Arquivo modificado**: `src/memory/rag.ts`
- O prompt passa a ter a estrutura:
  ```
  [SOUL]          ← soul.md (prioridade máxima)
  [EMOTIONS]      ← humor_atual atual
  [MEMORIES]      ← memórias relevantes (máx 5)
  [CONTEXT]       ← últimas trocas do curto prazo
  [USER_MESSAGE]  ← mensagem do usuário
  [INSTRUCTIONS]  ← regras de comportamento
  ```

### Estrutura do soul.md gerado automaticamente
```markdown
# Soul — Bolla

## Quem sou
[gerado a partir do trait `missao` e `estilo_fala`]

## Como me comunico
[gerado a partir de `regras_conversa` em formato narrativo]

## O que penso sobre o mundo
[gerado a partir de `opinioes` e `interesses`]

## Como estou me sentindo agora
[gerado a partir de `humor_atual` — atualizado dinamicamente]

## Minhas contradições
[espaço para o owner adicionar nuances reais — começa vazio]
```

### Impacto no serviço
Zero — se `data/soul.md` não existir, o sistema continua usando o `buildSystemPrompt()` atual.

### Rollback
Deletar `data/soul.md`. O sistema volta a usar o prompt da PersonalityService automaticamente.

### Como validar
```
!status          → deve mostrar "soul.md: carregado" ou "soul.md: usando defaults"
[mensagem casual] → resposta deve soar mais natural e coesa do que antes
```

---

## Etapa 2 — Context Budget: Orçamento de 5.000 Tokens

**Status: [ ] Pendente**

### Por que
O modelo `llama3.1:8b-12k` tem janela de 12K tokens. Mas prompts maiores = mais lentos.
Atualmente o prompt cresce sem controle: 7 memórias + histórico de 10 trocas + soul + instruções facilmente chegam a 8K+ tokens.

O target é **5.000 tokens** (~20.000 caracteres) por prompt — suficiente para contexto rico, rápido o suficiente para respostas em tempo aceitável.

### O que muda

**Arquivo novo**: `src/ai/context-budget.ts`
```typescript
// Estimativa simples: 1 token ≈ 4 caracteres (português)
estimateTokens(text: string): number
// Compõe o prompt respeitando o orçamento com prioridade
buildWithBudget(parts: ContextPart[], budgetTokens: number): string
```

**Prioridade de preservação** (maior → menor):
1. Soul/Personality (`~800 tokens` — nunca cortado)
2. Mensagem do usuário (nunca cortada)
3. Instrução final de comportamento (`~100 tokens` — nunca cortada)
4. Contexto de curto prazo — trimado para caber (máx últimas 6 trocas)
5. Memórias — reduzidas de 7 para quantas couberem no budget restante

**Arquivo modificado**: `src/memory/rag.ts`
- Integra `ContextBudget` na composição do prompt
- Logar quando o budget é atingido: `[RAG] context trimmed: memories=5→3 shortterm=10→6`

### Complexidade influencia o budget

| Complexity | Memórias máx | Short-term máx | Budget total |
|---|---|---|---|
| simple | 2 | 4 trocas | 3.000 tokens |
| medium | 5 | 8 trocas | 5.000 tokens |
| complex | 7 | 10 trocas | 5.000 tokens |

Mensagens simples (saudações, acks) não precisam de todo o contexto histórico — geram prompts menores e respostas muito mais rápidas.

### Impacto no serviço
Zero — começa conservador (budget de 5K, mantém comportamento atual para `medium`/`complex`).

### Rollback
Remover a integração do `ContextBudget` em `rag.ts` (2 linhas).

### Como validar
```
!status → deve mostrar tokens estimados do último prompt
```
Logs do servidor: `[RAG] context=4800/5000 tokens memories=5 shortterm=8`

---

## Etapa 3 — Router Ollama-First Limpo

**Status: [ ] Pendente**

### Por que
O router atual tem chains hardcoded:
```
medium:  ['ollama', 'grok', 'anthropic']
complex: ['ollama', 'anthropic', 'grok']
```
Com `GROK_API_KEY=` e `ANTHROPIC_API_KEY=` vazios, o router tenta Ollama, falha, tenta Grok (falha imediato com erro de configuração), tenta Anthropic (falha imediato) — desperdício de tempo de erro mesmo que pequeno.

Mais importante: o router deve adaptar o **comportamento** baseado na complexidade, não só o provider.

### O que muda

**Arquivo modificado**: `src/ai/router.ts`

Novo comportamento:
1. No startup, detectar quais providers têm credenciais (`hasOllama`, `hasGrok`, `hasAnthropic`)
2. Chain dinâmica: apenas providers configurados entram na lista
3. Com apenas Ollama: chain sempre `['ollama']` — sem tentativas de fallback inúteis
4. Latência de erro de provider não configurado: 0ms (skip imediato)

Adicionar configuração de comportamento por complexidade (independente do provider):
```typescript
// simple: menos contexto, temperatura baixa (respostas diretas)
// medium: contexto padrão, temperatura 0.7
// complex: contexto máximo, temperatura 0.8 (mais criativo)
const COMPLEXITY_CONFIG = {
  simple:  { temperature: 0.3, maxTokens: 512  },
  medium:  { temperature: 0.7, maxTokens: 1024 },
  complex: { temperature: 0.8, maxTokens: 2048 }
}
```

### Impacto no serviço
Zero — comportamento idêntico para Ollama. Apenas mais rápido ao detectar falhas.

### Rollback
Reverter `router.ts` para a versão anterior (chains hardcoded).

---

## Etapa 4 — Emotion Engine: Emoções Dinâmicas

**Status: [ ] Pendente**

### Por que
O OpenClaw injeta o estado emocional do agente em cada prompt — separado da identidade core. Isso muda o **tom** da resposta sem alterar quem o agente é.

Exemplo: após uma conversa onde o usuário ficou frustrado, o agente fica mais cuidadoso nas próximas respostas. Após resolver um problema difícil, fica mais energético.

### O que muda

**Arquivo novo**: `src/personality/emotion.ts`
```typescript
// Estado emocional efêmero (em memória, não persiste entre restarts)
// Baseado no `humor_atual` do banco como ponto de partida
export class EmotionEngine {
  private state: EmotionState = { mood: 'neutro', intensity: 0.5, lastUpdated: new Date() }

  // Atualiza baseado em sinais da conversa
  update(signals: ConversationSignal): void

  // Retorna bloco para injetar no prompt
  toPromptBlock(): string

  // Persiste no trait `humor_atual` a cada 10 conversas
  async persist(personality: PersonalityService): Promise<void>
}
```

**Sinais de atualização de emoção**:
- Usuário usou palavras positivas (`valeu`, `ótimo`, `funcionou`) → levemente mais energético
- Usuário ficou repetindo a mesma pergunta → levemente mais cuidadoso
- Problema complexo resolvido → satisfeito
- Timeout do modelo ou erro → neutro (não contaminar a conversa)

**Bloco no prompt** (injetado entre Soul e Memories):
```
[ESTADO ATUAL]
Humor agora: curioso e engajado
Intensidade: moderada
```

**Arquivo modificado**: `src/channels/whatsapp.ts`
- Após cada resposta, chamar `emotionEngine.update(signals)`
- A cada 10 conversas, chamar `emotionEngine.persist(personality)`

### Impacto no serviço
Zero — começa com `humor_atual` do banco. Se EmotionEngine falhar, ignora e continua.

### Rollback
Remover a injeção do bloco `[ESTADO ATUAL]` no prompt.

---

## Etapa 5 — Memory Intelligence: Memórias que Aprendem

**Status: [ ] Pendente**

### Por que
Atualmente as memórias são salvas sem deduplicação. Após semanas de uso, o banco terá centenas de memórias similares (`"Lucas gosta de TypeScript"`, `"Lucas prefere TypeScript a JavaScript"`, `"O usuário usa TypeScript"`) — todas buscadas, todas poluindo o contexto.

O OpenClaw resolve isso com três mecanismos que vamos implementar progressivamente.

### 5a — Promoção por Acesso (sem novo código, só query)

**Status: [ ] Pendente**

O campo `access_count` já existe. Só precisamos usá-lo no ranking da busca.

**Arquivo modificado**: `src/memory/store.ts`
- Atualizar a query de `search()` para incluir `access_count` no score:
  ```sql
  ORDER BY ts_rank(...) * (1 + LN(1 + access_count) * 0.1) DESC
  ```
- Memórias frequentemente relevantes sobem naturalmente no ranking

**Impacto**: Zero. Mudança de query, comportamento apenas melhorado.

### 5b — Deduplicação Passiva (background, sem bloquear)

**Status: [ ] Pendente**

**Arquivo novo**: `src/memory/deduplication.ts`
- Roda após salvar cada nova memória (async, não bloqueia a resposta)
- Busca memórias com >60% de overlap de palavras-chave
- Se overlap alto: mantém a mais longa, marca a mais curta como `status='merged'`
- Memórias `merged` são excluídas da busca mas preservadas no banco

**Arquivo modificado**: `src/memory/service.ts`
- Após `store.save()`, dispara `deduplication.check(newMemory)` em background

### 5c — Destilação Semanal (autônoma)

**Status: [ ] Pendente**

**Arquivo novo**: `src/memory/distillation.ts`
- Roda uma vez por semana (via cron ou `MEMORY_CONSOLIDATION_ENABLED=true`)
- Pega as últimas 100 conversas da tabela `training_data`
- Gera via Ollama: "Com base nessas conversas, quais são as preferências permanentes deste usuário?"
- Salva o resultado como memórias do tipo `distilled` (alta prioridade na busca)
- Similar ao `MEMORY.md` do OpenClaw

**Configuração necessária no `.env`**:
```
MEMORY_CONSOLIDATION_ENABLED=true
MEMORY_CONSOLIDATION_INTERVAL_HOURS=168  # 7 dias
```

### Impacto no serviço
Zero para 5a e 5b. 5c usa Ollama mas roda em background sem bloquear conversas.

---

## Etapa 6 — Response Humanizer: Formato WhatsApp

**Status: [ ] Pendente**

### Por que
Mesmo com `regras_conversa` instruindo a não usar markdown, o modelo `llama3.1:8b` às vezes retorna:
- `**palavra em negrito**`
- `- item com bullet`
- `# Título`
- Parágrafos enormes para perguntas simples

### O que muda

**Arquivo novo**: `src/ai/response-formatter.ts`
```typescript
export function formatForWhatsApp(text: string): string {
  // Strip markdown: **, *, #, ---
  // Converter bullets em vírgulas ou parágrafos
  // Remover quebras de linha triplas+
  // Truncar se > 2000 chars (limite WhatsApp)
}
```

**Arquivo modificado**: `src/channels/whatsapp.ts`
- Antes de `replyAndPersist()`, aplicar `formatForWhatsApp(ragResponse.text)`

### Regra de proporcionalidade (logar anomalias)
```typescript
// Input < 5 palavras e output > 150 palavras → log como anomalia
// Não corta a resposta, só registra para análise futura
```

### Impacto no serviço
Zero — formatter só remove artefatos, nunca adiciona. Resposta sempre enviada.

### Rollback
Remover a linha `formatForWhatsApp()` no whatsapp.ts.

---

## Tabela de Progresso

| # | Etapa | Status | Arquivos | Risco |
|---|---|---|---|---|
| 1 | Soul.md — identidade viva | [x] Concluída | `data/soul.md`, `personality/service.ts`, `memory/rag.ts` | Baixo |
| 2 | Context Budget — 5K tokens | [ ] Pendente | `ai/context-budget.ts`, `memory/rag.ts` | Baixo |
| 3 | Router limpo — Ollama-first | [ ] Pendente | `ai/router.ts` | Baixo |
| 4 | Emotion Engine — emoções dinâmicas | [ ] Pendente | `personality/emotion.ts`, `channels/whatsapp.ts` | Médio |
| 5a | Memory — promoção por acesso | [ ] Pendente | `memory/store.ts` | Baixo |
| 5b | Memory — deduplicação passiva | [ ] Pendente | `memory/deduplication.ts`, `memory/service.ts` | Baixo |
| 5c | Memory — destilação semanal | [ ] Pendente | `memory/distillation.ts` | Médio |
| 6 | Response Humanizer — formato WA | [ ] Pendente | `ai/response-formatter.ts`, `channels/whatsapp.ts` | Baixo |

---

## Como Trabalhar com este Plano

1. Escolher uma etapa
2. Marcar como `[~] Em andamento`
3. Implementar
4. Compilar: `npm run build`
5. Reiniciar: `pm2 restart bolla` (ou o comando de start do projeto)
6. Testar: `!ping` → `!status` → mensagem simples → mensagem técnica
7. Marcar como `[x] Concluída`
8. Commitar com a descrição da etapa

**Sempre commitar após cada etapa concluída** — garante rollback fácil com `git revert`.

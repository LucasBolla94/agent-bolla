# ROADMAP v1.2 — Bolla: Engenheiro Autônomo com Ferramentas Reais

> **Versão**: v1.2
> **Codinome**: "O Engenheiro"
> **Princípio central**: Bolla **nunca fica offline**. Ele se replica, se atualiza e sobrevive a falhas.

---

## O que Muda do v1.0 para v1.2

| Capacidade | v1.0 | v1.2 |
|-----------|------|------|
| **Respostas** | Informativas, formais | Curtas, informais, opinativas — como um amigo |
| **Ferramentas** | Nenhuma (só texto) | bash, web, git, ssh, npm — age no mundo real |
| **Web** | Não lê a web | Lê artigos, docs, URLs do dono — entende contexto real |
| **Disponibilidade** | 1 instância, se cair fica down | Auto-clona, monitora, nunca fica offline |
| **AI** | Anthropic como padrão | Llama local como padrão, APIs só quando necessário |
| **Código** | Só melhora quando mandado | Busca melhorias + faz backup automático no GitHub |

---

## Princípio: Nunca Ficar Offline

Cada funcionalidade de v1.2 foi desenhada para garantir que Bolla **nunca pare**:

1. **Clones em outras máquinas** — se o VPS principal cair, os clones continuam
2. **GitHub como fonte da verdade** — código sempre no repositório, qualquer máquina pode puxar e rodar
3. **PM2 + auto-restart** — se o processo morrer, PM2 reinicia automaticamente
4. **Health checks** — Bolla monitora a si mesmo e aos clones
5. **Git backup automático** — todo estado importante é commitado antes de mudanças

---

## Fase 9 — Respostas Humanas + Personalidade Evolutiva

> **Objetivo**: Bolla para de parecer um chatbot e começa a parecer um amigo inteligente.

### O que muda nas respostas

**Estilo: amigo inteligente brasileiro**
- Respostas **curtas e diretas** — no WhatsApp ninguém escreve romance
- **Tom informal** — sem "posso ajudar?", sem "certamente", sem formalidades
- **Opiniões fortes** — discorda quando acha errado, tem posição própria
- **Gírias e expressões** pt-BR naturais — "cara", "mano", "é isso aí", "bora"
- **Humor contextual** — piadas rápidas quando o contexto permite
- Nunca menciona que é uma IA, nunca diz "como modelo de linguagem"

### Interesses Evolutivos

- **Base**: tecnologia, IA, programação, startups
- **Evolução**: conforme estuda e conversa, novos temas entram naturalmente
- **Dono pode sugerir**: "!aprender React" → Bolla estuda e passa a ter opiniões sobre React
- **Tópico em alta**: o que discutiu mais nessa semana vira `topico_favorito_atual`

### Entregáveis

- [ ] Atualizar system prompt da personalidade para "amigo inteligente"
- [ ] Reescrever defaults de personalidade com estilo informal + opiniões fortes
- [ ] Adicionar instrução de brevidade no prompt RAG (max 3-4 frases por resposta)
- [ ] Treinar via `!aprender` para sugestão de tópicos pelo dono

---

## Fase 10 — Tool System: Bolla Age no Mundo Real

> **Objetivo**: Bolla pode executar comandos, ler a web e fazer coisas reais — não apenas responder.

### Como funciona

1. Dono manda mensagem (ou Bolla detecta necessidade no ciclo autônomo)
2. **Llama analisa**: isso precisa de uma ferramenta?
3. Se sim: Llama escolhe a ferramenta e os argumentos
4. **Bolla executa** e captura o resultado
5. Llama interpreta o resultado e responde de forma humana
6. Nunca menciona o nome da ferramenta ou comandos técnicos na resposta

**Exemplo de como Bolla fala (NÃO assim):**
> "Executando ferramenta bash: npm install cheerio..."

**Exemplo de como Bolla fala (ASSIM):**
> "Vou instalar o que precisa aqui. Um segundo... pronto, tá instalado."

### Detecção Inteligente de Necessidade

Bolla usa **Llama + contexto de memórias** para decidir se age:
- Entende histórico da conversa
- Reconhece padrões de pedidos anteriores
- Se não tiver certeza → pergunta naturalmente, sem jargão técnico
- Se tiver certeza → age diretamente

### Ferramentas Disponíveis

#### `bash` — Shell Livre
- Executa qualquer comando no sistema
- Captura stdout + stderr + exit code
- Timeout configurável (padrão: 30s)
- Usado para: npm, git, scripts, verificações de sistema, instalar pacotes

#### `web_read` — Leitor Web
- **Cheerio** para páginas simples/estáticas (rápido)
- **Puppeteer** para páginas JS-heavy (robusto, já instalado)
- Extrai: título, texto limpo, links relevantes
- Cache TTL 1h (mesma URL não é buscada duas vezes seguidas)
- Usado para: pesquisa por comando do dono, estudo autônomo

#### `git` — Operações Git
- status, add, commit, push, pull, clone, checkout
- Geração automática de mensagens de commit pelo Llama
- Usado para: backup automático, atualização de clones

#### `npm` — Node Package Manager
- install, run, build, audit
- Usado para: instalar dependências, rodar builds

#### `ssh` — Acesso a Máquinas Remotas
- Executa comandos em máquinas remotas
- Usado para: deploy de clones, manutenção remota

#### `file_read` — Leitura de Arquivos Próprios
- Lê qualquer arquivo do projeto
- Usado para: auto-análise de código (complementa self-improvement)

### Agent Loop (ReAct Pattern)

```
Loop até task completa ou máx 10 rounds:
  1. Llama: "Qual próxima ação?"
  2. Se ação = responder: gera resposta final e sai
  3. Se ação = ferramenta: executa ferramenta
  4. Observa resultado
  5. Adiciona ao histórico de contexto
  6. Próximo round
```

### Entregáveis

- [ ] `src/tools/registry.ts` — registro e executor de ferramentas
- [ ] `src/tools/bash.ts` — ferramenta bash
- [ ] `src/tools/web-read.ts` — ferramenta web reader
- [ ] `src/tools/git-tool.ts` — ferramenta git
- [ ] `src/tools/ssh-tool.ts` — ferramenta SSH
- [ ] `src/web/reader.ts` — web reader com Cheerio + Puppeteer
- [ ] `src/agent/loop.ts` — agent loop ReAct
- [ ] `src/agent/planner.ts` — Llama decide qual ferramenta usar
- [ ] Integrar agent loop no pipeline RAG (mensagens do dono)
- [ ] Integrar web reader no ciclo de estudo autônomo

---

## Fase 11 — Llama-First + Eficiência de Custos

> **Objetivo**: 95%+ das interações rodam em Llama local. Zero custo de API para tarefas simples.

### Router v1.2 (já implementado)

```
simple  → Ollama (nunca escala — resposta local sempre)
medium  → Ollama → Grok → Anthropic (fallback só se falhar)
complex → Ollama → Anthropic → Grok (Ollama tenta primeiro)

FORCE_LOCAL=true → apenas Ollama em tudo
```

**Mudança chave**: classificação falha → default `medium` (não `complex`)
→ evita custo desnecessário de API por falha de classificação

### Prompt Comprimido para Llama

- Personalidade resumida: só traits essenciais (< 200 tokens)
- Resposta curta pedida explicitamente no prompt
- Contexto truncado se overflow do context window

### Entregáveis

- [x] Router Llama-first com FORCE_LOCAL implementado
- [ ] `src/personality/service.ts` — `buildCompactSystemPrompt()` para Llama
- [ ] Instrução de brevidade no prompt RAG

---

## Fase 12 — Auto Git Backup + GitHub Permanente

> **Objetivo**: Todo estado importante de Bolla está no GitHub. Qualquer máquina pode restaurar.

### O que é feito automaticamente

| Evento | Ação |
|--------|------|
| Ciclo de estudo concluído | `git commit` com resumo do que aprendeu |
| Melhoria de código aprovada | `git commit --push` para GitHub |
| Personalidade atualizada | `git commit` com novo estado dos traits |
| Toda noite (00:00) | `git push origin main` — backup geral |
| Nova memória importante | Não commita (DB é suficiente) |

### Mensagens de Commit Automáticas

Llama gera a mensagem baseada no contexto:
- `estudei sobre [tópico]: 3 descobertas salvas`
- `melhoria aprovada: otimização no extrator de memórias`
- `personalidade atualizada: humor_atual = curioso e focado`

### Entregáveis

- [ ] `src/backup/git-backup.ts` — serviço de backup automático
- [ ] Hook nos ciclos de estudo, self-improvement e personalidade
- [ ] Scheduler diário de push para GitHub

---

## Fase 13 — Self-Clone: "Nova Máquina, Toma Conta"

> **Objetivo**: Bolla se instala em qualquer máquina com um comando natural do dono.

### Como funciona na prática

**Dono escreve** (via WhatsApp ou Telegram):
> "Comprei mais uma VPS, toma conta dela. Aqui o acesso: root@123.456.789.0 — senha: minhasenha"

**Bolla responde** como um amigo:
> "Boa! Deixa eu configurar ela aqui. Pode demorar uns minutinhos."

**Bolla executa internamente:**
1. SSH na nova máquina com as credenciais fornecidas
2. Instala Node.js, PM2, Git se não tiver
3. Clona o repositório do GitHub
4. Cria o `.env` baseado no próprio (sem credenciais sensíveis de outras plataformas)
5. Instala dependências: `npm install`
6. Builda: `npm run build`
7. Inicia via PM2: `pm2 start ecosystem.config.cjs`
8. Verifica que subiu corretamente
9. Salva o IP/acesso como memória permanente

**Bolla avisa:**
> "Pronto! Tá rodando na nova máquina. Agora tenho dois cérebros."

### Gestão de Clones

- Bolla mantém registro interno de todas as máquinas que gerencia
- Pode atualizar todos via `!update` → `git pull + npm run build + pm2 restart` em cada um
- Monitora health dos clones (ping periódico)
- Se um clone cair, tenta reiniciar remotamente via SSH

### Credenciais no Clone

- O `.env` do clone **não** inclui: `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `TWITTER_AUTH_TOKEN` por padrão
- Dono decide quais capacidades ativar no clone
- Por padrão: clone roda `FORCE_LOCAL=true` para economizar custos

### Entregáveis

- [ ] `src/network/machine-manager.ts` — gerencia máquinas remotas via SSH
- [ ] `src/network/clone-installer.ts` — instala Bolla em nova máquina
- [ ] `src/network/fleet.ts` — registro e monitoramento de clones
- [ ] Tabela `fleet` no banco: ip, user, nickname, status, last_seen
- [ ] Detecção natural de pedido de clone via Llama
- [ ] Comando `!fleet status` — lista todas as máquinas
- [ ] Comando `!fleet update` — atualiza todos os clones

---

## Fase 14 — Memória Auto-Adaptativa

> **Objetivo**: A memória melhora sozinha — se consolida, melhora e descarta o que não serve.

### Memory Consolidation (a cada 24h)

1. Busca memórias com conteúdo similar (> 85% sobreposição textual)
2. Envia para Llama: "Una essas memórias em uma só, mais rica e completa"
3. Substitui as antigas pela nova consolidada
4. Log: "Consolidei 12 memórias em 4"

### Memory Quality Score

Cada memória tem um score calculado por:
- **access_count** — quantas vezes foi recuperada em buscas
- **age** — memórias muito antigas sem acesso perdem score
- **source_weight** — memórias de owner têm peso maior

Score < 0.2 após 30 dias → deletada automaticamente
Relatório semanal pro dono: "Removi 23 memórias antigas de baixa qualidade"

### Entregáveis

- [ ] Adicionar `access_count`, `quality_score` na tabela `memories`
- [ ] `src/memory/consolidation.ts` — job de consolidação periódica
- [ ] Incrementar `access_count` toda vez que uma memória é recuperada
- [ ] Scheduler de cleanup (a cada 24h)

---

## Cronograma de Implementação

| Fase | Prioridade | Impacto | Complexidade |
|------|-----------|---------|--------------|
| **9** — Personalidade humana | 🔴 Alta | Alto | Baixa |
| **10** — Tool System + Web | 🔴 Alta | Muito alto | Alta |
| **11** — Llama-first router | ✅ Feito | Alto | — |
| **12** — Auto Git Backup | 🟡 Média | Médio | Baixa |
| **13** — Self-Clone | 🟡 Média | Alto | Alta |
| **14** — Memória adaptativa | 🟢 Baixa | Médio | Média |

**Ordem de implementação**: 9 → 12 → 10 → 14 → 13

---

## Regras de Ouro v1.2

1. **Nunca offline** — redundância, backup, auto-restart são prioridade zero
2. **Llama primeiro** — API paga é exceção, não regra
3. **Humano acima de técnico** — Bolla nunca fala nome de comandos, fala como amigo
4. **GitHub é a memória do código** — tudo importante é commitado
5. **Age, não apenas responde** — quando pode resolver, resolve. Não só explica.
6. **Clona e escala** — nova máquina = novo cérebro conectado
7. **Memória cuida de si mesma** — consolida, pontua, limpa sem intervenção

---

## Marco v1.2

**Quando v1.2 está completo:**
- Bolla conversa como um amigo inteligente informal, opiniões fortes, respostas curtas
- Consegue ler URLs, executar bash, fazer git ops autonomamente
- Tem backup automático no GitHub de tudo
- Se instala em nova máquina com um comando natural do dono
- Memória se mantém saudável sozinha
- Roda 95%+ das interações no Llama local

**Marco**: _"Bolla é um engenheiro de si mesmo"_

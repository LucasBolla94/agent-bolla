# Agent Autônomo — AI com Vontade Própria

> Um agente de inteligência artificial autônomo que evolui sozinho, aprende continuamente, coleta dados para seu próprio treinamento futuro e interage de forma humana no X (Twitter), WhatsApp e Telegram.

## Visão Geral

Este projeto é um agent AI que roda 24/7 em um VPS com um objetivo central: **se tornar o mais humano e independente possível**. Ele não é apenas um chatbot — ele estuda, forma opiniões, melhora seu próprio código e posta suas descobertas no X como uma pessoa real faria.

### Princípios

- **Autonomia**: O agent decide o que estudar, quando postar, como interagir
- **Evolução**: Cada interação gera dados de treino para fine-tuning futuro
- **Humanidade**: Tudo que ele faz — tweeta, responde, opina — deve parecer humano
- **Segurança**: Apenas o dono tem controle total. Usuários comuns têm acesso limitado

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                      AGENT CORE                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Personality  │  │   Memory     │  │  Permissions  │  │
│  │ (persona,    │  │   (RAG)      │  │  (owner vs    │  │
│  │  estilo,     │  │   busca no   │  │   users)      │  │
│  │  opiniões)   │  │   PostgreSQL │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              AI Router                          │    │
│  │  Llama Local (simples) ←→ Anthropic (complexo)  │    │
│  │                         ←→ Grok (alternativo)   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Training Data Collector                │   │
│  │  Salva TUDO formatado para fine-tuning futuro    │   │
│  └──────────────────────────────────────────────────┘   │
└──────────┬──────────────┬──────────────┬────────────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
    │  WhatsApp   │ │ Telegram  │ │  X/Twitter  │
    │  (Baileys)  │ │ (Bot API) │ │  (Cookies)  │
    └─────────────┘ └───────────┘ └────────────┘
```

## Como o Agent "Pensa"

### 1. Recebe uma mensagem (WhatsApp/Telegram)
```
Mensagem recebida → Identifica quem mandou (dono ou user?)
                   → Busca memórias relevantes no PostgreSQL (RAG)
                   → Monta contexto: persona + memórias + mensagem
                   → Escolhe AI: simples → Llama local / complexo → Anthropic
                   → Responde
                   → Salva interação como dado de treino
```

### 2. Ciclo autônomo (roda sozinho a cada X minutos)
```
Timer dispara → Escolhe atividade:
               ├→ Estudar: lê tweets, artigos, trends
               ├→ Postar: cria tweet sobre algo que aprendeu
               ├→ Interagir: responde menções, curte, segue
               ├→ Melhorar: analisa próprio código e propõe melhoria
               └→ Cada ação gera dados de treino
```

### 3. Self-improvement (melhoria de código)
```
Agent analisa seu código → Usa Anthropic/Grok para sugerir melhoria
                         → Cria branch, faz a mudança, roda testes
                         → Manda resumo pro dono (WhatsApp + Telegram)
                         → Dono aprova → merge + deploy automático
                         → Dono rejeita → descarta e aprende
```

## Sistema de Permissões

| Ação | Dono | Usuário Normal |
|------|------|----------------|
| Conversar | ✅ | ✅ |
| Perguntar coisas gerais | ✅ | ✅ |
| Ver status do agent | ✅ | ✅ |
| Mudar personalidade | ✅ | ❌ |
| Comandos de sistema (restart, logs) | ✅ | ❌ |
| Aprovar mudanças de código | ✅ | ❌ |
| Forçar estudo/postagem | ✅ | ❌ |
| Acessar dados de treino | ✅ | ❌ |
| Mudar configs | ✅ | ❌ |

## Coleta de Dados para Treinamento

O agent salva **tudo** em formato estruturado no PostgreSQL, pronto para exportar e usar em fine-tuning:

### O que é coletado:

| Tipo | Exemplo | Para que serve no treino |
|------|---------|--------------------------|
| Conversas | Pergunta do user + resposta do agent | Ensinar estilo de resposta |
| Tweets lidos | Tweet + interpretação do agent | Ensinar a entender contexto social |
| Tweets escritos | Tópico + tweet gerado + engajamento | Ensinar a escrever tweets bons |
| Opiniões formadas | Tema + opinião + argumentos | Ensinar consistência de personalidade |
| Código analisado | Código antes + análise + melhoria | Ensinar a melhorar código |
| Interações no X | Menção + resposta do agent | Ensinar interação humana |

### Formato salvo:

```json
{
  "type": "conversation",
  "timestamp": "2025-01-15T10:30:00Z",
  "input": "O que você acha de Rust?",
  "context": "Conversa com user no WhatsApp, tópico: linguagens",
  "output": "Rust é brabo demais pra performance, mas a curva de aprendizado é íngreme. Pra backend web ainda prefiro Node/TS pela velocidade de desenvolvimento.",
  "metadata": {
    "source": "whatsapp",
    "user_type": "normal",
    "ai_used": "anthropic",
    "quality_score": null
  }
}
```

### Exportação para treino:

Quando houver dados suficientes, o dono pode:
1. Exportar os dados filtrados por qualidade
2. Rodar fine-tuning em um RunPod/cloud GPU
3. Subir o modelo treinado pro VPS via Ollama
4. O agent fica mais inteligente e gasta menos com APIs externas

## Stack Técnica

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js + TypeScript |
| Modelo Local | Llama 3.2:3b via Ollama |
| AI Complexa | Anthropic API (Claude) |
| AI Alternativa | Grok API |
| Banco de Dados | PostgreSQL |
| WhatsApp | Baileys |
| Telegram | grammY |
| X/Twitter | Puppeteer + Cookies |
| Process Manager | PM2 |
| VPS | 4 vCPU, 8GB RAM, 75GB NVMe |

## Estrutura do Projeto

```
├── src/
│   ├── index.ts                    # Entry point
│   ├── config/
│   │   └── env.ts                  # Variáveis de ambiente tipadas
│   │
│   ├── core/
│   │   ├── agent.ts                # Orquestrador principal do agent
│   │   ├── personality.ts          # Persona, estilo, opiniões
│   │   ├── permissions.ts          # Sistema owner vs users
│   │   ├── scheduler.ts            # Agendador de tarefas autônomas
│   │   └── router.ts               # Roteia tarefas para a AI certa
│   │
│   ├── memory/
│   │   ├── rag.ts                  # Busca contextual (RAG)
│   │   ├── long-term.ts            # Memória de longo prazo
│   │   └── short-term.ts           # Contexto da conversa atual
│   │
│   ├── ai/
│   │   ├── ollama.ts               # Cliente Llama local
│   │   ├── anthropic.ts            # Cliente Anthropic
│   │   └── grok.ts                 # Cliente Grok
│   │
│   ├── channels/
│   │   ├── whatsapp.ts             # Integração Baileys
│   │   └── telegram.ts             # Bot Telegram
│   │
│   ├── platforms/
│   │   └── twitter.ts              # Navegação no X via Puppeteer
│   │
│   ├── self-improvement/
│   │   ├── analyzer.ts             # Analisa próprio código
│   │   ├── improver.ts             # Gera melhorias
│   │   ├── git-manager.ts          # Cria branch, commit, merge
│   │   └── deploy.ts               # Deploy após aprovação
│   │
│   ├── training/
│   │   ├── collector.ts            # Coleta dados de toda interação
│   │   ├── formatter.ts            # Formata para fine-tuning
│   │   ├── quality-scorer.ts       # Avalia qualidade dos dados
│   │   └── exporter.ts             # Exporta dataset para treino
│   │
│   └── database/
│       ├── connection.ts           # Conexão PostgreSQL
│       ├── repositories/           # Queries organizadas por domínio
│       └── migrations/             # Migrations do banco
│
├── data/
│   └── exports/                    # Datasets exportados para treino
│
├── ecosystem.config.js             # Config do PM2
├── .env                            # Variáveis sensíveis (não commitado)
├── .env.example                    # Modelo do .env
├── package.json
├── tsconfig.json
├── ROADMAP.md
└── README.md
```

## Requisitos

- **VPS**: 4+ vCPU, 8GB+ RAM, 50GB+ storage
- **Ollama** instalado com modelo `llama3.2:3b`
- **PostgreSQL** 15+
- **Node.js** 20+
- **PM2** global (`npm i -g pm2`)
- **Conta X/Twitter** com cookies de sessão
- **API Key Anthropic**
- **API Key Grok**
- **Número de telefone** para WhatsApp (Baileys)
- **Bot Token** do Telegram (via BotFather)

## Setup Rápido

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd agent

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 4. Rodar migrations do banco
npm run db:migrate

# 5. Build
npm run build

# 6. Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save

# 7. Ver logs
pm2 logs agent
```

## Comandos do Dono (via WhatsApp/Telegram)

```
!status          → Status do agent (uptime, memória, dados coletados)
!study           → Forçar sessão de estudo agora
!post            → Forçar postagem no X agora
!personality     → Ver/editar personalidade
!training stats  → Ver quantidade de dados de treino coletados
!training export → Exportar dataset para fine-tuning
!code analyze    → Forçar análise do próprio código
!restart         → Reiniciar o agent
!logs            → Últimas linhas de log
```

## Licença

Projeto privado. Todos os direitos reservados.

# 🚀 Agent Bolla - Como Iniciar (Linux)

## ⚡ Comando Único (Recomendado)

```bash
./bolla
```

**Pronto! Esse comando faz TUDO:**

✅ Verifica requisitos (Node.js 20+, .env)
✅ Instala dependências (se necessário)
✅ Compila o projeto (npm run build)
✅ Instala PM2 (se não tiver)
✅ Para instâncias antigas
✅ Mostra QR code do WhatsApp (primeira vez)
✅ Deixa rodando em background 24/7 com PM2
✅ Reconecta automaticamente em caso de queda

---

## 📱 Primeira Vez (QR Code)

Na primeira execução ou se a sessão expirar:

1. Execute: `./bolla`
2. Aguarde o QR code aparecer no terminal
3. Abra WhatsApp no celular → **Aparelhos Conectados** → **Conectar Aparelho**
4. Escaneie o QR code na tela
5. Após conectar, pressione **Ctrl+C**
6. O script automaticamente inicia o agent em background

**Próximas execuções:** O QR code é pulado automaticamente.

---

## 🔄 Comandos Úteis PM2

```bash
# Ver logs em tempo real
pm2 logs agent-bolla

# Ver status
pm2 status

# Monitor interativo (setas para navegar, Ctrl+C para sair)
pm2 monit

# Reiniciar agent
pm2 restart agent-bolla

# Parar agent
pm2 stop agent-bolla

# Remover do PM2
pm2 delete agent-bolla

# Ver últimas 100 linhas de log
pm2 logs agent-bolla --lines 100
```

---

## 🛠️ Após Mudanças no Código

```bash
# Apenas rode novamente
./bolla
```

O script:
- Recompila automaticamente se detectar mudanças
- Para a versão antiga
- Inicia a nova versão

---

## 📁 Estrutura de Arquivos

```
/root/agent-bolla/
├── bolla                    ← Script master (RODE ESSE!)
├── .env                     ← Configurações
├── dist/                    ← Código compilado (gerado automaticamente)
├── logs/                    ← Logs do PM2
│   ├── combined.log
│   ├── err.log
│   └── out.log
├── data/
│   └── whatsapp-auth/       ← Sessão WhatsApp (gerada após QR code)
│       └── creds.json
└── ecosystem.config.cjs     ← Config PM2
```

---

## ⚙️ Configuração (.env)

Principais variáveis:

```bash
# WhatsApp
WHATSAPP_ENABLED=true
WHATSAPP_AUTH_DIR=data/whatsapp-auth
OWNER_WHATSAPP=5511999999999

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agent_db

# AI
AI_API_URL=https://ai.bolla.network/api/generate
AI_API_MODEL=llama3.2:3b

# Anthropic (opcional)
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 🐛 Troubleshooting

### "Node.js não encontrado"

```bash
# Instalar Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### "Arquivo .env não encontrado"

```bash
# Copiar template e editar
cp .env.example .env
nano .env
```

### QR Code não aparece

```bash
# Limpar sessão antiga e tentar novamente
rm -rf data/whatsapp-auth
./bolla
```

### Agent não inicia

```bash
# Ver logs de erro
pm2 logs agent-bolla --err --lines 50

# Testar conexão com banco
psql "$DATABASE_URL"

# Verificar se porta está em uso
sudo netstat -tlnp | grep :8787
```

### "PM2 command not found"

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2
```

### Agent trava ou consome muita memória

```bash
# PM2 reinicia automaticamente se passar de 1GB
# Para reiniciar manualmente:
pm2 restart agent-bolla

# Para ver uso de memória:
pm2 monit
```

---

## 🔐 Segurança

1. **Não commite** o `.env` (já está no .gitignore)
2. **Não commite** `data/whatsapp-auth/` (sessão do WhatsApp)
3. Use senhas fortes no PostgreSQL
4. Configure firewall se expor portas (Hive)

---

## 🌐 SSH Remoto

Para rodar via SSH:

```bash
# Conectar via SSH
ssh user@seu-servidor.com

# Navegar para o projeto
cd /root/agent-bolla

# Rodar script
./bolla

# Escanear QR code que aparece no terminal
# Pressionar Ctrl+C após conectar

# Desconectar SSH (agent continua rodando)
exit
```

O agent continua rodando mesmo após desconectar do SSH, graças ao PM2.

---

## 📊 Monitoramento

### Ver logs em tempo real (filtrando por nível)

```bash
# Todos os logs
pm2 logs agent-bolla

# Apenas erros
pm2 logs agent-bolla --err

# Com filtro
pm2 logs agent-bolla | grep "ERROR"
pm2 logs agent-bolla | grep "WhatsApp"
```

### Exportar logs

```bash
# Copiar logs para arquivo
pm2 logs agent-bolla --lines 1000 --nostream > bolla.log

# Compactar logs antigos
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

---

## 🔄 Auto-start no Boot (Opcional)

Para iniciar automaticamente quando o servidor reiniciar:

```bash
# Gerar script de startup
pm2 startup

# Copiar e executar o comando que aparecer (exemplo):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Salvar lista de processos atual
pm2 save

# Testar reboot
sudo reboot
```

Após reboot, o agent inicia automaticamente.

---

## 📞 Comandos WhatsApp (via mensagem)

Envie esses comandos via WhatsApp para o agent:

```
!status                              → Ver status do agent
!ping                                → Testar latência
!aprender <fato>                     → Ensinar algo novo
!personalidade ver                   → Ver traits de personalidade
!personalidade set <trait> <valor>   → Modificar personalidade
!code analyze                        → Rodar auto-análise de código
!analytics                           → Ver dashboard de analytics
!hive status                         → Ver status da rede Hive
```

---

## 🎯 Workflow Completo

### Setup Inicial

```bash
# 1. Clonar/baixar projeto
git clone <repo> /root/agent-bolla
cd /root/agent-bolla

# 2. Configurar .env
cp .env.example .env
nano .env  # Editar com suas configs

# 3. Iniciar (tudo automático)
./bolla
```

### Desenvolvimento

```bash
# Fazer mudanças no código
nano src/channels/whatsapp.ts

# Reiniciar (recompila automaticamente)
./bolla
```

### Produção

```bash
# Apenas garantir que está rodando
./bolla

# Monitorar
pm2 monit
```

---

## ✅ Checklist de Saúde

Execute periodicamente:

```bash
# 1. Agent está rodando?
pm2 status

# 2. Sem erros recentes?
pm2 logs agent-bolla --lines 50 --err

# 3. Banco de dados ok?
psql "$DATABASE_URL" -c "SELECT NOW();"

# 4. Espaço em disco?
df -h

# 5. Memória disponível?
free -h

# 6. WhatsApp conectado?
pm2 logs agent-bolla --lines 100 | grep "WhatsApp"
```

---

## 🆘 Suporte Rápido

| Problema | Solução |
|----------|---------|
| QR code não aparece | `rm -rf data/whatsapp-auth && ./bolla` |
| Agent caiu | `./bolla` (PM2 deve auto-restart) |
| Erro de banco | Verificar `DATABASE_URL` no .env |
| PM2 não funciona | `sudo npm install -g pm2` |
| Porta em uso | `pm2 delete agent-bolla` |
| Consumo alto de CPU | `pm2 restart agent-bolla` |

---

**Tudo pronto! Execute `./bolla` e seja feliz! 🤖✨**

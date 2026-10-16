# Camarize V2

Plataforma avançada de monitoramento para aquicultura (camarões). Conecta sensores IoT (ESP32) a tanques e viveiros, monitora parâmetros vitais (temperatura, pH, amônia) e envia alertas automatizados quando as condições saem da faixa ideal.

---

## Estrutura do Projeto

O repositório adota um padrão de **Monorepo**, dividindo as responsabilidades de backend, frontend e hardware:

```text
/
├── api/           — Backend em Express.js + Mongoose (Porta 4000)
├── front-react/   — Frontend em Next.js 14 (Porta 3000)
├── esp32/         — Firmware Arduino C++ para os dispositivos IoT
├── docs/          — Documentações de Arquitetura, Banco de Dados e API
├── tools/         — Configurações do Docker e Docker Compose
└── .github/       — Pipelines de CI/CD (GitHub Actions)
```

## Tecnologias Principais

- **Frontend:** Next.js 14, React, Tailwind CSS / Vanilla CSS.
- **Backend:** Node.js, Express.js, JWT (Autenticação).
- **Banco de Dados:** MongoDB (Atlas Cloud) via Mongoose.
- **Testes:** Vitest (Testes unitários e cobertura de código).
- **DevOps:** Docker, GitHub Actions (CI/CD contínuo).
- **Hardware:** ESP32 (C++).

---

## Pré-requisitos

Para rodar este projeto, você precisa ter instalado:
- **Node.js** (v18 ou superior)
- **Docker** e **Docker Compose**
- Acesso de rede para o **MongoDB Atlas** (A URL do banco é necessária)

---

## 🐳 Configuração com Docker (Recomendado)

O Docker criará instâncias isoladas tanto para o Backend quanto para o Frontend.

### 1. Variáveis de Ambiente
Na raiz da API, copie o template de variáveis de ambiente:
```bash
# Dentro de tools/ (ou qualquer pasta, ajuste o --out)
mongodump --uri="URL_DE_PRODUCAO" --out=./dump

mongorestore \
  --uri="URI_DO_ATLAS_COM_BANCO_CAMARIZE_DEV" \
  ./dump/NOME_DO_BANCO_DE_PRODUCAO
```

Abra o `api/.env.docker` e certifique-se de preencher as chaves de segurança:
- `JWT_SECRET` (Use um gerador de senhas longas)
- `MONGO_URL` (Sua string de conexão do MongoDB Atlas)
- Chaves do `VAPID` (para notificações Web Push) e chaves de e-mail.

### 2. Subir os Containers
```bash
cd tools
docker compose up --build   # Primeira vez (baixa as imagens e faz a build)
docker compose up           # Execuções seguintes
```

- 🟢 **Frontend:** http://localhost:3000
- 🟢 **API:** http://localhost:4000
- 🟢 **Swagger UI (Docs da API):** http://localhost:4000/api-docs

---

## ⚡ Configuração Manual (Node.js Local)

Se você precisa rodar no modo de desenvolvimento raiz para debug, instale e inicie cada serviço separadamente.

### 1. Iniciar a API
```bash
cd api
cp .env.docker.example .env  # Preencha suas chaves
npm install
npm start
```

### 2. Iniciar o Frontend
Em outro terminal:
```bash
cd front-react
npm install
npm run dev
```

---

## 🧪 Testes e Qualidade (CI/CD)

Este projeto possui integração contínua (CI/CD) rigorosa via **GitHub Actions**. A cada push para a branch principal, o servidor executa:
1. Verificação de código (ESLint).
2. **Testes Unitários da API** com relatórios de cobertura.
3. Build estático de produção do Frontend.
4. Auditoria de vulnerabilidades em dependências (`npm audit`).
5. Build de imagens Docker de validação.

### Como rodar os testes localmente:
```bash
cd api
npm run test           # Roda todos os testes via Vitest
npm run test:coverage  # Roda os testes e gera relatório de cobertura
```

---

## 📚 Documentação Adicional

Todos os detalhes específicos de implementação estão na pasta `docs/`.

- 📄 **[API_README.md](./docs/API_README.md)**: Detalhes específicos de arquitetura, pastas e execução da API.
- 🗄️ **[ERD_CAMARIZE.md](./docs/ERD_CAMARIZE.md)**: Diagrama Completo (Entity-Relationship Diagram) do Banco de Dados MongoDB.
- ☁️ **[MONGODB_ATLAS_SETUP.md](./docs/MONGODB_ATLAS_SETUP.md)**: Guia passo a passo para criar e configurar seu Cluster MongoDB.
- ⚙️ **[README_ESP32.md](./docs/README_ESP32.md)**: Informações sobre os circuitos, calibração de sensores e código do ESP32.

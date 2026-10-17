# CI/CD do Camarize

## Escopo e estado

Equipe de três integrantes, projeto acadêmico e sensores de teste. Hospedagem: frontend na
Vercel (`camarize-frontend`, conta pessoal do mantenedor) e API no Render (`camarize-api`,
mesma conta) — ambos criados em 2026-10-17, substituindo os projetos anteriores que estavam
na conta de um ex-integrante do grupo.

O processo é **PR → CI → merge → deploy automático**, com o deploy condicionado ao CI passar
em cada plataforma, do jeito nativo de cada uma (não por um workflow de publicação único):

- **Render**: Auto-Deploy configurado como **"After CI Checks Pass"** — o Render observa os
  check runs do commit no GitHub e só publica se todos (incluindo os do `ci.yml`) estiverem
  verdes. Nenhuma configuração extra no lado do GitHub Actions é necessária para isso.
- **Vercel**: sem integração Git nativa (de propósito — ela dispararia build a cada push,
  ignorando nosso CI). O job `deploy-frontend` em `ci.yml` só roda em push na `main` e só se
  `ci-passed` tiver sido bem-sucedido; ele mesmo builda e publica via Vercel CLI.

Isso substitui o fluxo de "publicação manual" descrito mais abaixo neste documento, que segue
existindo como caminho alternativo (ex.: republicar um SHA específico fora do fluxo normal),
mas não é mais o caminho principal de deploy.

**Pendência relacionada, fora do escopo desta reconfiguração:** o `MONGO_URL` em uso ainda
aponta para um cluster do MongoDB Atlas (`joaocluster`, usuário `joaokusaka27`) que aparenta
pertencer ao mesmo ex-integrante cujas contas de hospedagem acabamos de substituir. Migrar o
banco para uma conta Atlas própria da equipe é um passo separado, ainda não feito.

## Verificações obrigatórias

`.github/workflows/ci.yml` roda em PRs e pushes na `main`:

| Job | Evidência |
| --- | --- |
| Lint API | `node --check` em todo `.js` da API e ESLint |
| Testes API | Suíte Vitest (`npm run test:coverage`) contra um MongoDB de serviço do runner; relatório de cobertura anexado |
| Build Frontend | Build de produção do Next.js |
| Verificação de Segredos | `node scripts/ci/check-secrets.mjs` — credenciais conhecidas e dumps versionados no checkout |
| Testes E2E (Playwright) | Sobe API + frontend reais com MongoDB de serviço; Chromium exercitando login, dashboard e relatório; relatório HTML/JUnit e trace em falha |
| Auditoria de Dependências | `npm audit --omit=dev --audit-level=critical` em `api` e `front-react` (não bloqueante — reportado, não bloqueia o gate) |
| Docker Build | Builda as imagens Docker da API e do frontend, após os testes e o build passarem |
| CI gate | Reprova se Lint API, Testes API, Build Frontend, Verificação de Segredos ou E2E falharem; Auditoria e Docker Build são informativos |

Cache npm por lockfile. Nenhum segredo de produção é entregue ao CI de PRs.

Os testes de integração (`api/tests/alerts.test.js`, `application.test.js`) exigem um MongoDB real —
por isso os jobs "Testes API" e "Testes E2E" sobem um serviço `mongo:7.0` com `MONGO_TEST_URL`
apontando para ele. `safety.test.js` não precisa de banco. O job de E2E builda o frontend com
`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SSE_URL` apontando para `127.0.0.1:4100` (API de teste exclusiva
de `api/tests/e2e-server.js`), nunca para o ambiente publicado.

O scanner de segredos é uma proteção adicional para padrões conhecidos, não um scanner universal nem
uma limpeza do histórico. Ative secret scanning/push protection no GitHub quando houver acesso.
As credenciais anteriormente versionadas devem ser rotacionadas pelo responsável pelos serviços.
Os dumps foram retirados do índice do Git e permanecem locais/ignorados; cópias históricas continuam no Git.

## Executar localmente

Use Node 24 (registrado em `.nvmrc` e `.node-version`):

```sh
nvm use
npm ci
npm ci --prefix api
npm ci --prefix front-react
docker run --detach --rm --name camarize-ci-mongo --publish 127.0.0.1:27028:27017 mongo:7.0
npm run lint
npm run check:secrets
npm --prefix api test
node --test scripts/ci/*.test.mjs
NEXT_PUBLIC_API_URL=http://127.0.0.1:4100 NEXT_PUBLIC_SSE_URL=http://127.0.0.1:4100 npm run build
npx --no-install playwright install chromium
npm run test:e2e
docker stop camarize-ci-mongo
```

Se o container já existir, reutilize-o. Para usar outra porta, defina `MONGO_TEST_URL`, por exemplo
`mongodb://127.0.0.1:27029`, sem nome de banco, credenciais nem query string.
Os testes rejeitam destinos externos e criam bancos `camarize_test_<suite>_<pid>`, removidos ao encerrar.
Eles não leem `MONGO_URL` nem `.env` e nunca iniciam o monitoramento automático. Os testes de alertas
simulam o envio; a instância de Nodemailer usa transporte JSON em `NODE_ENV=test`.
O executor E2E é exclusivo de `api/tests/e2e-server.js` e não é incluído no servidor de produção.

Portas 4100/3100 são exclusivas do E2E; não reutilize servidores de desenvolvimento nesses testes.
O build deve ser feito com as URLs de teste antes do E2E: `NEXT_PUBLIC_*` é incorporado ao JavaScript.

## Configuração do Render

Serviço atual: `camarize-api` (`srv-db9vn87btjjs73d7tu30`), workspace pessoal do mantenedor
no Render, criado em 2026-10-17. URL: `https://camarize-api.onrender.com`.

1. Branch `main`, Root Directory `api`, runtime Node.
2. Build Command `npm ci`; Start Command `npm start` (executa `node index.js`).
3. Health Check Path `/api/health`.
4. Variáveis configuradas no painel (nunca no Git): `MONGO_URL`, `JWT_SECRET`, `FRONTEND_URL`,
   `EMAIL_USER`, `EMAIL_PASS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `ENABLE_AUTO_MONITORING`, `VALIDATE_EMAIL_ON_REGISTER`. As chaves VAPID são as geradas em
   2026-10-17 (`npx web-push generate-vapid-keys`) — a mesma chave pública está na Vercel.
5. **Auto-Deploy: "After CI Checks Pass"** (não "On Commit" nem "Off"). O Render espera todos os
   check runs do commit no GitHub (o `ci.yml` inteiro, incluindo auditoria e build Docker) antes
   de publicar. Isso substitui qualquer necessidade de um job de deploy no GitHub Actions para a
   API — o Render mesmo observa o resultado do CI.

A API só escuta após conectar ao banco, retorna 503 se perder a conexão e inclui
`RENDER_GIT_COMMIT` no readiness. Ao receber SIGTERM, interrompe o monitoramento e fecha servidor/banco.
Não há rotas de diagnóstico expostas; `/test/*` sempre retorna 404.

No Free, a API pode dormir após 15 minutos sem tráfego, demorar a retomar e reiniciar.
Isso pausa o monitoramento periódico; não há garantia de monitoramento contínuo gratuito.
SMTP nas portas 25/465/587 é bloqueado. O serviço atual ainda usa Gmail SMTP: para demonstrar
e-mail a partir do Render Free, adaptar para um provedor com API HTTPS é uma entrega posterior.
Não coloque uma URL de produção nem credenciais reais no CI para contornar essas limitações.

`scripts/ci/deploy-render.mjs` (dispara deploy via API do Render para um commit específico e
aguarda `/api/health` confirmar banco conectado e o commit certo) não é usado pelo Auto-Deploy
nativo — fica disponível para o fluxo de publicação manual descrito mais abaixo.

## Configuração da Vercel

Projeto atual: `camarize-frontend` (`prj_JUMJ6Nz4b4N0TDMJ8J5htb4DHl0h`, org
`team_ykJ84mrqMxjFpMl0RDymKMEb`, conta pessoal do mantenedor), criado em 2026-10-17.
URL: `https://camarize-frontend.vercel.app`. **Sem integração Git nativa** — isso é intencional,
ela dispararia build a cada push ignorando o resultado do nosso CI.

1. Framework Next.js, Root Directory `front-react`, Node 24.
2. Variáveis de ambiente de **produção** configuradas direto no projeto (`vercel env add ... production`):
   `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SSE_URL` (URL do Render acima), `API_PROXY_URL` (mesma URL,
   tipo `config` — não `secret`, senão o build não consegue ler o valor de volta), e
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mesma chave pública do Render).
3. Quem publica: o job `deploy-frontend` em `ci.yml`, via `vercel pull/build/deploy --prebuilt --prod`,
   autenticado com `VERCEL_TOKEN` (secret do repositório). Só roda em push na `main`, e só se
   `ci-passed` tiver sucesso — ver `## Verificações obrigatórias` acima.

O frontend usa `output: standalone` para suportar `/rel-individual/<id>` e rewrites.
Na Vercel, o adaptador Next gerencia a publicação. No Docker, o target `production` roda `server.js`;
o Compose de desenvolvimento seleciona explicitamente o target `development`.
O site deixa de gerar `out/`; remova qualquer override de Output Directory `out` no painel.

## Publicação manual (caminho alternativo, não o principal)

Desde 2026-10-17 o deploy normal é automático (seções acima). Este workflow
(`.github/workflows/deploy.yml`, "Publish production manually") continua existindo para um
cenário específico: republicar um SHA já aprovado sob demanda, fora do fluxo automático — por
exemplo, para re-tentar uma publicação sem precisar de um commit novo.

Configure em GitHub → Settings → Secrets and variables → Actions (ou no environment `production`):

| Tipo | Nome | Status |
| --- | --- | --- |
| Secret | `RENDER_API_KEY` | ⬜ não configurado |
| Secret | `VERCEL_TOKEN` | ✅ configurado (reaproveitado do deploy automático da Vercel) |
| Variable | `RENDER_SERVICE_ID` | ⬜ não configurado — usar `srv-db9vn87btjjs73d7tu30` |
| Variable | `API_URL` | ✅ configurado |
| Variable | `VERCEL_ORG_ID` | ✅ configurado |
| Variable | `VERCEL_PROJECT_ID` | ✅ configurado |
| Variable | `ENABLE_MANUAL_DEPLOY` | ⬜ não configurado — só ativar depois do `RENDER_API_KEY` acima |

Nunca envie tokens na conversa nem acrescente arquivos privados ao commit.

Em Actions, execute **Publish production manually**, selecione `main` e digite `PUBLICAR`.
O workflow captura o SHA da execução, roda novamente todo o CI e:

1. Prepara o frontend com as variáveis de produção usando CLI Vercel fixada e `--prebuilt`.
2. Solicita à API do Render a publicação desse SHA completo e aguarda o deploy ficar `live`.
3. Confirma `/api/health`: banco conectado e mesmo SHA.
4. Publica o frontend preparado, verifica `/login` e registra os identificadores da versão.

A API precisa manter compatibilidade com o frontend anterior durante a atualização. Não existe transação
atômica entre as plataformas. Se a API ou readiness falhar, o workflow não publica o frontend. Se o
frontend falhar depois da API, use o runbook abaixo. O workflow não faz rollback automático de banco.
Timeout de deploy não significa que o Render parou; confira o painel antes de repetir ou recuperar.

## Revisão e proteções

Enquanto não houver acesso de administrador, PR, revisão por outro integrante e CI aprovado são
um procedimento da equipe; não impedem tecnicamente push direto ou merge com erro. O deploy
automático (Render "After CI Checks Pass" e o job `deploy-frontend`) dispara sozinho assim que o
CI fica verde em um push na `main` — não há aprovação humana nesse caminho hoje.

Quando o administrador estiver disponível:

- Proteger `main`: PR obrigatório, uma aprovação de outro integrante e status check `CI gate` obrigatório.
- Invalidar aprovação após novos commits; exigir resolução das conversas e impedir force push/exclusão.
- Configurar o environment `production` com revisores e impedir autoaprovação/bypass conforme política da equipe.
- Ativar secret scanning/push protection; revisar credenciais e permissões dos tokens de deploy.

Como o repositório é público, revisores de environments estão disponíveis nos planos gratuitos compatíveis.
O environment só é proteção independente depois de configurado no painel.

## Recuperação

1. Anotar SHA e IDs no resumo da execução e identificar a última versão funcional de cada plataforma.
2. Confirmar no Render se há deploy em andamento; evitar publicar ou reverter em paralelo.
3. Se frontend falhou e API anterior é necessária, usar rollback do Render para a última versão funcional.
   No Free, o histórico elegível é limitado; alternativamente publicar o SHA anterior pelo painel.
4. Na Vercel, usar Instant Rollback para uma versão que já foi produção, confirmando suas URLs de API.
5. Verificar health, login, leitura do dashboard, SSE e ingestão de um sensor de teste.
6. Registrar o incidente no PR e corrigir antes de nova publicação.

Rollback do código não restaura dados. Migrações futuras devem ser explícitas e compatíveis com as
duas versões, com backup privado e procedimento de restauração previamente validado.

## Evidências para a banca e próximos incrementos

Guarde o PR revisado, o link da execução `CI gate`, relatórios de API/navegador, resumo da publicação
e registro de um exercício de rollback em homologação. Faça um ensaio com os sensores físicos e
com a retomada do Render antes da apresentação.

Esta entrega não compila nem publica firmware/OTA e não cria homologação remota permanente.
Próximos incrementos: compilar o ESP32 com toolchain/libraries fixadas; autenticar cada dispositivo
(a ingestão atual é pública); tratar sensor sem novas leituras; adaptar e-mail para API HTTPS;
ampliar testes de permissões de escrita; resolver os avisos de hooks/imagens; praticar restauração de banco.

## Referências

- [Limites gratuitos do Render](https://render.com/docs/free)
- [Deploy por commit e integração com CI no Render](https://render.com/docs/deploys)
- [Configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration)
- [Variáveis públicas incorporadas ao build Next](https://nextjs.org/docs/pages/guides/environment-variables)
- [Environments e revisores do GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

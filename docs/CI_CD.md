# CI/CD do Camarize

## Escopo e estado

Equipe de três integrantes, projeto acadêmico e sensores de teste. Hospedagem mantida:
frontend na Vercel, API no Render e MongoDB no Atlas. As alterações desta entrega são locais;
os workflows passam a existir no GitHub quando a branch for enviada e integrada.

O processo usa PR → CI → revisão → merge → publicação manual. A homologação automatizada
ocorre em serviços locais temporários do runner, com o build de produção do frontend.
Não há uma segunda API permanente no Render nesta etapa; isso evita compartilhar dados do
ambiente publicado e consumir horas gratuitas com duas APIs continuamente ativas.

## Verificações obrigatórias

`.github/workflows/ci.yml` roda em PRs, pushes na `main`, execução manual e como workflow reutilizável:

| Job | Evidência |
| --- | --- |
| API lint and integration tests | Lint bloqueante; login, logout, isolamento entre fazendas, ingestão, dashboard, SSE e alertas; relatório JUnit |
| Frontend lint build and browser tests | Lint bloqueante; build; Chromium acessando login, dashboard e relatório dinâmico; relatório HTML/JUnit e trace em falha |
| Secrets and production dependencies | Verificação de segredos conhecidos e dumps no checkout, testes do controlador de deploy e auditoria das três árvores de dependências |
| CI gate | Só aprova quando todos os jobs acima terminam com sucesso; falhas, cancelamentos e jobs ignorados não aprovam |

As actions são fixadas por SHA. Há timeout nos jobs, cancelamento de CI obsoleto, cache npm por
lockfile e retenção de relatórios por 14 dias. Nenhum segredo de produção é entregue ao CI de PRs.
O audit bloqueia vulnerabilidades altas e críticas em dependências de produção; moderadas seguem visíveis.
45 avisos existentes de hooks/imagens do frontend são dívida técnica visível e não bloqueiam esta entrega.

O scanner local é uma proteção adicional para padrões conhecidos, não um scanner universal nem uma
limpeza do histórico. Ative secret scanning/push protection no GitHub quando houver acesso.
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

Para gerar JUnit da API: `mkdir -p api/test-results && npm --prefix api run test:ci`.
Portas 4100/3100 são exclusivas do E2E; não reutilize servidores de desenvolvimento nesses testes.
O build deve ser feito com as URLs de teste antes do E2E: `NEXT_PUBLIC_*` é incorporado ao JavaScript.

## Configuração do Render

O responsável com acesso ao serviço deve configurar:

1. Branch `main`, Root Directory `api`, runtime Node 24.
2. Build Command `npm ci`; Start Command `npm start` (executa `node index.js`).
3. Health Check Path `/api/health`.
4. Variáveis `MONGO_URL`, `JWT_SECRET`, `FRONTEND_URL` e chaves de notificações no painel, nunca no Git.
5. Auto-Deploy **Off** antes de ativar o workflow manual.

A API só escuta após conectar ao banco, retorna 503 se perder a conexão e inclui
`RENDER_GIT_COMMIT` no readiness. Ao receber SIGTERM, interrompe o monitoramento e fecha servidor/banco.
Rotas `/test` estão desabilitadas por padrão e sempre desabilitadas em produção.

No Free, a API pode dormir após 15 minutos sem tráfego, demorar a retomar e reiniciar.
Isso pausa o monitoramento periódico; não há garantia de monitoramento contínuo gratuito.
SMTP nas portas 25/465/587 é bloqueado. O serviço atual ainda usa Gmail SMTP: para demonstrar
e-mail a partir do Render Free, adaptar para um provedor com API HTTPS é uma entrega posterior.
Não coloque uma URL de produção nem credenciais reais no CI para contornar essas limitações.

## Configuração da Vercel

1. Framework Next.js, Root Directory `front-react`, Node 24 e branch de produção `main`.
2. Definir `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SSE_URL` com a URL HTTPS da API publicada.
3. Definir `NEXT_PUBLIC_VAPID_PUBLIC_KEY` correspondente à chave da API quando push estiver habilitado.
4. Conferir `API_PROXY_URL` se necessário. Rewrites relativos seguem a URL pública da API por padrão.
5. Desativar publicação automática da `main` quando o workflow manual for ativado; acrescentar
   a configuração abaixo a `front-react/vercel.json` (mesclando com o arquivo existente, se houver).
   A opção pertence ao arquivo de configuração, não a um botão específico do painel.
   Previews de PRs podem ficar habilitados,
   mas devem apontar a uma API/banco de homologação, não ao ambiente publicado.

```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

Esse arquivo ainda não foi criado nesta entrega; acrescente-o na transição para o deploy manual,
após preparar os acessos. O comando de publicação via CLI continuará funcionando.

O frontend usa `output: standalone` para suportar `/rel-individual/<id>` e rewrites.
Na Vercel, o adaptador Next gerencia a publicação. No Docker, o target `production` roda `server.js`;
o Compose de desenvolvimento seleciona explicitamente o target `development`.
O site deixa de gerar `out/`; remova qualquer override de Output Directory `out` no painel.

## Ativar publicação manual

Configure em GitHub → Settings → Secrets and variables → Actions (ou no environment `production`):

A variável `ENABLE_MANUAL_DEPLOY` deve ficar no nível do repositório: o job inicial de ativação
é executado antes de entrar no environment. Os tokens e demais variáveis podem ficar no environment.

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret | `RENDER_API_KEY` | Token da conta com acesso ao serviço |
| Secret | `VERCEL_TOKEN` | Token com acesso ao projeto |
| Variable | `RENDER_SERVICE_ID` | ID `srv-…` da API |
| Variable | `API_URL` | URL HTTPS da API |
| Variable | `VERCEL_ORG_ID` | Organização/conta Vercel |
| Variable | `VERCEL_PROJECT_ID` | ID do projeto Vercel |
| Variable | `ENABLE_MANUAL_DEPLOY` | `true`, somente após concluir as configurações |

Os IDs da Vercel são obtidos ao vincular o projeto com a CLI e ler `.vercel/project.json`, que é ignorado.
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
um procedimento da equipe; não impedem tecnicamente push direto ou merge com erro.
O workflow manual é executável por quem tem permissão de escrita e não representa aprovação independente.
Até desativar auto-deploys nas plataformas, os pipelines atuais também podem publicar por fora dele.

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

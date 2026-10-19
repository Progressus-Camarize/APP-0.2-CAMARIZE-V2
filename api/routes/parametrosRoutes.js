import express from "express";
import { cadastrarParametros, provisionDevice, getDeviceCredentialHistory, updateTemperatureLimits, updateSensitivityLimits, getThresholdSuggestions, getParametrosAtuais, getParametrosHistoricos, getDadosDashboard, streamDashboard } from "../controllers/parametrosController.js";
import Auth from "../middleware/Auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Parâmetros
 *   description: Leituras de sensores — temperatura, pH e amônia. Protótipos sem chave continuam a enviar dados, mas suas leituras não geram avisos.
 */

/**
 * @swagger
 * /parametros/cadastrar:
 *   post:
 *     summary: Registrar leitura de sensor (ESP32)
 *     tags: [Parâmetros]
 *     description: >
 *       Sem o header X-Device-Key, a leitura é aceita mas marcada como legado
 *       (`autenticada: false`) — ela fica visível no histórico, mas nunca entra na
 *       pipeline de avisos (Camadas 1/2) nem na detecção de sensor inativo. Gere a
 *       chave em `POST /parametros/dispositivos/{cativeiroId}/chave`.
 *     parameters:
 *       - in: header
 *         name: X-Device-Key
 *         required: false
 *         schema:
 *           type: string
 *         description: Chave do dispositivo. Presente e válida = leitura autenticada; presente e inválida = 401; ausente = leitura legada.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParametroCreate'
 *     responses:
 *       201:
 *         description: Leitura registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Parâmetros cadastrados com sucesso }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     cativeiro: { type: string, example: Viveiro A1 }
 *                     temperatura: { type: number }
 *                     ph: { type: number }
 *                     amonia: { type: number }
 *                     datahora: { type: string, format: date-time }
 *                     origem: { type: string, enum: [dispositivo, legado] }
 *       200:
 *         description: Leitura repetida (mesmo amostraId autenticado, ou mesmo valor em até 10s) — idempotente, não duplica
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 repetida: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *       400:
 *         description: Dados inválidos (campo obrigatório ausente, fora da faixa física aceita, ou amostraId mal formatado)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: X-Device-Key presente, mas inválida para este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/cadastrar", cadastrarParametros);

/**
 * @swagger
 * /parametros/dispositivos/{cativeiroId}/chave:
 *   post:
 *     summary: Gerar (ou rotacionar) a chave de autenticação do dispositivo ESP32
 *     tags: [Parâmetros]
 *     description: >
 *       Gera uma nova chave para o dispositivo do viveiro. A chave aparece em texto puro
 *       **somente nesta resposta** — a API guarda apenas o hash, nunca a chave em si. Gerar
 *       uma nova chave revoga a anterior imediatamente (upsert por cativeiro). Requer papel
 *       admin ou master com acesso ao viveiro.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Chave gerada — guarde-a no firmware do ESP32 agora, ela não será mostrada de novo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chave:
 *                   type: string
 *                   example: 3f1c2a9e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a2918f7e6d5c4b3a291807f6e
 *                 aviso:
 *                   type: string
 *                   example: Guarde esta chave no ESP32. Ela será exibida somente agora; gerar outra revoga a anterior.
 *       400:
 *         description: ID de viveiro inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Papel membro, ou usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/dispositivos/:cativeiroId/chave', Auth.Authorization, provisionDevice);

/**
 * @swagger
 * /parametros/dispositivos/{cativeiroId}/historico:
 *   get:
 *     summary: Histórico de rotação da chave do dispositivo (auditoria)
 *     tags: [Parâmetros]
 *     description: Nunca retorna a chave em si — apenas quem gerou cada rotação e quando.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Lista de rotações, mais recente primeiro
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 historico:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       geradoEm:
 *                         type: string
 *                         format: date-time
 *                       geradoPor:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           nome:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                             enum: [membro, admin, master]
 *       403:
 *         description: Papel membro, ou usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/dispositivos/:cativeiroId/historico', Auth.Authorization, getDeviceCredentialHistory);

/**
 * @swagger
 * /parametros/limites-temperatura/{cativeiroId}:
 *   patch:
 *     summary: Definir os limites de temperatura que disparam aviso para este viveiro
 *     tags: [Parâmetros]
 *     description: Deixe o padrão do sistema (ideal ± 2°C) sendo usado enquanto este endpoint não for chamado.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [minimo, maximo]
 *             properties:
 *               minimo:
 *                 type: number
 *                 example: 26
 *               maximo:
 *                 type: number
 *                 example: 30
 *     responses:
 *       200:
 *         description: Limites atualizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 minimo:
 *                   type: number
 *                 maximo:
 *                   type: number
 *       400:
 *         description: Limites inválidos (fora da faixa -5 a 50°C, ou mínimo ≥ máximo)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Papel membro, ou usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Viveiro ainda não tem condições ideais configuradas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/limites-temperatura/:cativeiroId', Auth.Authorization, updateTemperatureLimits);

/**
 * @swagger
 * /parametros/limites-sensibilidade/{cativeiroId}:
 *   patch:
 *     summary: Definir a sensibilidade de detecção de tendência de pH e amônia para este viveiro
 *     tags: [Parâmetros]
 *     description: Deixe o padrão do sistema (pH 0,35 / amônia 25%) sendo usado enquanto este endpoint não for chamado.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phLimiar, amoniaLimiarPct]
 *             properties:
 *               phLimiar:
 *                 type: number
 *                 minimum: 0.05
 *                 maximum: 3
 *                 example: 0.35
 *               amoniaLimiarPct:
 *                 type: number
 *                 minimum: 0.05
 *                 maximum: 1
 *                 example: 0.25
 *     responses:
 *       200:
 *         description: Limiares atualizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phLimiar:
 *                   type: number
 *                 amoniaLimiarPct:
 *                   type: number
 *       400:
 *         description: Limiares fora da faixa aceita
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Papel membro, ou usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Viveiro ainda não tem condições ideais configuradas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/limites-sensibilidade/:cativeiroId', Auth.Authorization, updateSensitivityLimits);

/**
 * @swagger
 * /parametros/sugestao-limiares/{cativeiroId}:
 *   get:
 *     summary: Sugestão de calibração de limiares com base no histórico de avaliações
 *     tags: [Parâmetros]
 *     description: >
 *       Camada 2 da pipeline de avisos: aprende com o histórico de avaliações
 *       (confirmado/falso_alarme) já registradas e sugere afrouxar limiares ruidosos.
 *       Nunca aplica a mudança sozinha, apenas sugere — quem decide é o admin/master.
 *       Exige ao menos 5 avisos avaliados por tipo para sugerir algo; sem essa amostra,
 *       retorna `null` para aquele tipo.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Sugestões por tipo de parâmetro (null quando não há amostra suficiente ou nada a sugerir)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sugestoes:
 *                   type: object
 *                   properties:
 *                     temperatura:
 *                       $ref: '#/components/schemas/SugestaoLimiar'
 *                     ph:
 *                       $ref: '#/components/schemas/SugestaoLimiar'
 *                     amonia:
 *                       $ref: '#/components/schemas/SugestaoLimiar'
 *       403:
 *         description: Papel membro, ou usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/sugestao-limiares/:cativeiroId', Auth.Authorization, getThresholdSuggestions);

/**
 * @swagger
 * /parametros/atuais/{cativeiroId}:
 *   get:
 *     summary: Buscar leitura mais recente de um viveiro
 *     tags: [Parâmetros]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Última leitura válida do viveiro (campos vêm null se nunca houve leitura)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cativeiro:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     nome: { type: string }
 *                 parametros:
 *                   type: object
 *                   properties:
 *                     temperatura: { type: number, nullable: true }
 *                     ph: { type: number, nullable: true }
 *                     amonia: { type: number, nullable: true }
 *                     datahora: { type: string, format: date-time, nullable: true }
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/atuais/:cativeiroId", Auth.Authorization, getParametrosAtuais);

/**
 * @swagger
 * /parametros/historicos/{cativeiroId}:
 *   get:
 *     summary: Buscar histórico paginado de leituras de um viveiro
 *     tags: [Parâmetros]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *       - in: query
 *         name: dias
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 365
 *         description: Janela de dias retroativos
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 500
 *           maximum: 1000
 *         description: Registros por página
 *     responses:
 *       200:
 *         description: Página de leituras históricas, ordenadas por data crescente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cativeiro:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     nome: { type: string }
 *                 periodo: { type: string, example: 7 dias }
 *                 total_registros: { type: integer, description: Quantidade nesta página }
 *                 pagina: { type: integer }
 *                 proximaPagina: { type: integer, nullable: true, description: null quando não há mais páginas }
 *                 dados:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       datahora: { type: string, format: date-time }
 *                       temperatura: { type: number }
 *                       ph: { type: number }
 *                       amonia: { type: number }
 *                       origem: { type: string, enum: [dispositivo, legado] }
 *       400:
 *         description: Período ou paginação inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/historicos/:cativeiroId", Auth.Authorization, getParametrosHistoricos);

/**
 * @swagger
 * /parametros/dashboard/{cativeiroId}:
 *   get:
 *     summary: Dados completos para o dashboard de um viveiro
 *     tags: [Parâmetros]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Dados consolidados para a tela de dashboard — leitura atual, médias dos últimos 7 dias, frescor da leitura, análise de tendência e avisos ativos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cativeiro:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     nome: { type: string }
 *                 dadosAtuais:
 *                   type: object
 *                   properties:
 *                     temperatura: { type: number, nullable: true }
 *                     ph: { type: number, nullable: true }
 *                     amonia: { type: number, nullable: true }
 *                     datahora: { type: string, format: date-time, nullable: true }
 *                 dadosSemanais:
 *                   type: array
 *                   description: Um ponto por dia dos últimos 7 dias (médias), null nos dias sem leitura
 *                   items:
 *                     type: object
 *                     properties:
 *                       data: { type: string, example: '2026-10-19' }
 *                       temperatura: { type: number, nullable: true }
 *                       ph: { type: number, nullable: true }
 *                       amonia: { type: number, nullable: true }
 *                 frescor:
 *                   type: object
 *                   properties:
 *                     estado: { type: string, enum: [sem_dados, recente, antigo] }
 *                     ultimaLeitura: { type: string, format: date-time, nullable: true }
 *                     idadeMinutos: { type: integer, nullable: true }
 *                 analise:
 *                   type: object
 *                   description: Se a janela recente de leituras é suficiente para a detecção de tendência (avisoService.evaluate)
 *                   properties:
 *                     suficiente: { type: boolean }
 *                     razao: { type: string, nullable: true, enum: [lacuna, leitura_antiga, leituras_insuficientes, null] }
 *                 avisosAtivos:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Aviso'
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/dashboard/:cativeiroId", Auth.Authorization, getDadosDashboard);

/**
 * @swagger
 * /parametros/stream/{cativeiroId}:
 *   get:
 *     summary: Stream (SSE) dos dados do dashboard de um viveiro
 *     tags: [Parâmetros]
 *     description: >
 *       Server-Sent Events — mesma forma de dados de `GET /parametros/dashboard/{cativeiroId}`,
 *       enviada imediatamente na conexão e novamente a cada nova leitura registrada para o
 *       viveiro. Mantém a conexão aberta com um ping de keepalive a cada 15s. Aceita o token
 *       tanto no header Authorization quanto na query string `?token=` (útil porque o
 *       EventSource do navegador não permite enviar headers customizados).
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *       - in: query
 *         name: token
 *         required: false
 *         schema:
 *           type: string
 *         description: Token JWT, alternativa ao header Authorization
 *     responses:
 *       200:
 *         description: Conexão SSE estabelecida (text/event-stream); cada evento `data:` tem o mesmo formato do corpo de GET /parametros/dashboard/{cativeiroId}
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *       404:
 *         description: Viveiro não encontrado
 */
router.get("/stream/:cativeiroId", Auth.AuthorizationSSE, streamDashboard);

export default router;

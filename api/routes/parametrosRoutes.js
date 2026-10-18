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
 *     description: Use X-Device-Key e amostraId para leituras confiáveis e idempotentes. Sem chave, a leitura é marcada como legado e não gera aviso.
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
 *               $ref: '#/components/schemas/ParametroAtual'
 *       400:
 *         description: Dados inválidos ou viveiro não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/cadastrar", cadastrarParametros);
router.post('/dispositivos/:cativeiroId/chave', Auth.Authorization, provisionDevice);
router.get('/dispositivos/:cativeiroId/historico', Auth.Authorization, getDeviceCredentialHistory);
router.patch('/limites-temperatura/:cativeiroId', Auth.Authorization, updateTemperatureLimits);
router.patch('/limites-sensibilidade/:cativeiroId', Auth.Authorization, updateSensitivityLimits);
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
 *         description: Parâmetros atuais do viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ParametroAtual'
 *       404:
 *         description: Nenhuma leitura encontrada para este viveiro
 */
router.get("/atuais/:cativeiroId", Auth.Authorization, getParametrosAtuais);

/**
 * @swagger
 * /parametros/historicos/{cativeiroId}:
 *   get:
 *     summary: Buscar histórico de leituras de um viveiro
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
 *         description: Lista de leituras históricas ordenadas por data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParametroAtual'
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
 *         description: Dados consolidados — leitura atual, histórico, médias e condições ideais
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 parametrosAtuais:
 *                   $ref: '#/components/schemas/ParametroAtual'
 *                 historico:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ParametroAtual'
 *                 condicoesIdeais:
 *                   $ref: '#/components/schemas/CondicoesIdeais'
 *                 medias:
 *                   type: object
 *                   properties:
 *                     temp_media:
 *                       type: number
 *                     ph_medio:
 *                       type: number
 *                     amonia_media:
 *                       type: number
 */
router.get("/dashboard/:cativeiroId", Auth.Authorization, getDadosDashboard);

router.get("/stream/:cativeiroId", Auth.AuthorizationSSE, streamDashboard);

export default router;

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

import express from 'express';
import notificationController from '../controllers/notificationController.js';
import Auth from '../middleware/Auth.js';
import monitoringService from '../services/monitoringService.js';

const router = express.Router();

router.use(Auth.Authorization);

/**
 * @swagger
 * tags:
 *   - name: Notificações
 *     description: Alertas gerados pelo monitoramento dos viveiros
 *   - name: Monitoramento
 *     description: Controle do serviço de monitoramento automático (verifica condições a cada N minutos)
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Listar avisos de todos os viveiros acessíveis ao usuário autenticado
 *     tags: [Notificações]
 *     description: Master vê todos os viveiros; demais papéis, só os viveiros das fazendas associadas.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Avisos, mais recentes primeiro
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 total: { type: integer }
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Aviso'
 */
router.get('/', notificationController.getNotifications);

/**
 * @swagger
 * /notifications/cativeiro/{cativeiroId}:
 *   get:
 *     summary: Listar avisos de um viveiro específico
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Avisos do viveiro, mais recentes primeiro
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 total: { type: integer }
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Aviso'
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/cativeiro/:cativeiroId', notificationController.getNotificationsByCativeiro);

/**
 * @swagger
 * /notifications/cativeiro/{cativeiroId}/resumo:
 *   get:
 *     summary: Resumo estatístico dos avisos de um viveiro
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Totais, falsos alarmes e tempo médio de conferência
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 porParametro:
 *                   type: object
 *                   properties:
 *                     temperatura: { type: integer }
 *                     ph: { type: integer }
 *                     amonia: { type: integer }
 *                     sensor_inativo: { type: integer }
 *                 verificados: { type: integer }
 *                 falsosAlarmes: { type: integer }
 *                 tempoMedioConferenciaMinutos: { type: number, nullable: true }
 *       403:
 *         description: Usuário sem acesso a este viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/cativeiro/:cativeiroId/resumo', notificationController.getNotificationSummary);

/**
 * @swagger
 * /notifications/{id}/avaliacao:
 *   patch:
 *     summary: Avaliar um aviso como confirmado ou falso alarme
 *     tags: [Notificações]
 *     description: >
 *       Só a primeira avaliação é registrada (idempotente — reenviar não sobrescreve).
 *       Alimenta a Camada 2 (sugestão de calibração de limiares).
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do aviso
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [avaliacao]
 *             properties:
 *               avaliacao:
 *                 type: string
 *                 enum: [confirmado, falso_alarme]
 *     responses:
 *       200:
 *         description: Avaliação registrada (ou já existente)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 verificadoEm: { type: string, format: date-time }
 *                 avaliacao: { type: string, enum: [confirmado, falso_alarme] }
 *       400:
 *         description: Avaliação inválida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Usuário sem acesso ao viveiro deste aviso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Aviso não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/avaliacao', notificationController.evaluateNotification);

/**
 * @swagger
 * /notifications/nao-vistos:
 *   get:
 *     summary: Contar avisos criados desde a última vez que o usuário abriu as notificações
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Contagem de avisos não vistos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 naoVistos: { type: integer }
 */
router.get('/nao-vistos', notificationController.getUnreadCount);

/**
 * @swagger
 * /notifications/marcar-visto:
 *   post:
 *     summary: Marcar os avisos como vistos agora pelo usuário autenticado
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Marcado com sucesso
 */
router.post('/marcar-visto', notificationController.markNotificationsSeen);

/**
 * @swagger
 * /notifications/push/subscribe:
 *   post:
 *     summary: Inscrever dispositivo para push notifications
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subscription]
 *             properties:
 *               subscription:
 *                 type: object
 *                 description: Objeto de subscription gerado pela Web Push API do navegador
 *                 properties:
 *                   endpoint:
 *                     type: string
 *                   keys:
 *                     type: object
 *                     properties:
 *                       p256dh:
 *                         type: string
 *                       auth:
 *                         type: string
 *               deviceInfo:
 *                 type: object
 *                 properties:
 *                   userAgent:
 *                     type: string
 *                   platform:
 *                     type: string
 *     responses:
 *       201:
 *         description: Dispositivo inscrito com sucesso
 */
router.post('/push/subscribe', notificationController.subscribeToPush);

/**
 * @swagger
 * /notifications/push/unsubscribe:
 *   post:
 *     summary: Cancelar inscrição de push notifications do dispositivo
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subscription]
 *             properties:
 *               subscription:
 *                 type: object
 *                 properties:
 *                   endpoint:
 *                     type: string
 *     responses:
 *       200:
 *         description: Inscrição cancelada
 */
router.post('/push/unsubscribe', notificationController.unsubscribeFromPush);

/**
 * @swagger
 * /notifications/monitoring/status:
 *   get:
 *     summary: Verificar status do serviço de monitoramento automático
 *     tags: [Monitoramento]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status atual do monitoramento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 monitoring:
 *                   type: object
 *                   properties:
 *                     isRunning:
 *                       type: boolean
 *                     intervalMinutes:
 *                       type: number
 *                     lastCheck:
 *                       type: string
 *                       format: date-time
 */
// Monitoramento é global (todas as fazendas): só o master controla
router.get('/monitoring/status', Auth.RequireRole(['master']), (req, res) => {
  try {
    const status = monitoringService.getStatus();
    res.status(200).json({ success: true, monitoring: status });
  } catch (error) {
    console.error('Erro ao obter status do monitoramento:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

/**
 * @swagger
 * /notifications/monitoring/start:
 *   post:
 *     summary: Iniciar monitoramento automático
 *     tags: [Monitoramento]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               intervalMinutes:
 *                 type: number
 *                 default: 5
 *                 description: Intervalo em minutos entre cada verificação
 *     responses:
 *       200:
 *         description: Monitoramento iniciado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/monitoring/start', Auth.RequireRole(['master']), (req, res) => {
  try {
    const intervalMinutes = Number(req.body?.intervalMinutes ?? 5);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      return res.status(400).json({ success: false, error: 'intervalMinutes deve ser um número entre 1 e 1440' });
    }
    monitoringService.startMonitoring(intervalMinutes);
    res.status(200).json({ success: true, message: `Monitoramento iniciado a cada ${intervalMinutes} minutos` });
  } catch (error) {
    console.error('Erro ao iniciar monitoramento:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

/**
 * @swagger
 * /notifications/monitoring/stop:
 *   post:
 *     summary: Parar monitoramento automático
 *     tags: [Monitoramento]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoramento parado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/monitoring/stop', Auth.RequireRole(['master']), (req, res) => {
  try {
    monitoringService.stopMonitoring();
    res.status(200).json({ success: true, message: 'Monitoramento parado' });
  } catch (error) {
    console.error('Erro ao parar monitoramento:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

/**
 * @swagger
 * /notifications/monitoring/check:
 *   post:
 *     summary: Executar verificação manual imediata de todos os viveiros
 *     tags: [Monitoramento]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Verificação executada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/monitoring/check', Auth.RequireRole(['master']), async (req, res) => {
  try {
    await monitoringService.manualCheck();
    res.status(200).json({ success: true, message: 'Verificação manual executada' });
  } catch (error) {
    console.error('Erro na verificação manual:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;

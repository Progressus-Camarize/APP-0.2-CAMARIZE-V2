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
 *     summary: Listar notificações do usuário autenticado
 *     tags: [Notificações]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notificações/alertas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   tipo:
 *                     type: string
 *                     enum: [temperature, pH, amonia]
 *                   severidade:
 *                     type: string
 *                     enum: [baixa, media, alta]
 *                   mensagem:
 *                     type: string
 *                   cativeiro:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/', notificationController.getNotifications);

/**
 * @swagger
 * /notifications/cativeiro/{cativeiroId}:
 *   get:
 *     summary: Listar notificações de um viveiro específico
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
 *         description: Notificações do viveiro
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/cativeiro/:cativeiroId', notificationController.getNotificationsByCativeiro);
router.get('/cativeiro/:cativeiroId/resumo', notificationController.getNotificationSummary);
router.patch('/:id/avaliacao', notificationController.evaluateNotification);

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
router.get('/monitoring/status', (req, res) => {
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
router.post('/monitoring/start', (req, res) => {
  try {
    const { intervalMinutes = 5 } = req.body;
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
router.post('/monitoring/stop', (req, res) => {
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
router.post('/monitoring/check', async (req, res) => {
  try {
    await monitoringService.manualCheck();
    res.status(200).json({ success: true, message: 'Verificação manual executada' });
  } catch (error) {
    console.error('Erro na verificação manual:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;

import express from 'express';
import notificationController from '../controllers/notificationController.js';
import Auth from '../middleware/Auth.js';

const router = express.Router();

router.use(Auth.Authorization);

/**
 * @swagger
 * tags:
 *   name: E-mail
 *   description: Configurações de alertas por e-mail do usuário
 */

/**
 * @swagger
 * /email/settings:
 *   get:
 *     summary: Obter configurações de e-mail do usuário autenticado
 *     tags: [E-mail]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações de e-mail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailSettings'
 *   put:
 *     summary: Atualizar configurações de e-mail
 *     tags: [E-mail]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailSettings'
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailSettings'
 */
router.get('/settings', notificationController.getEmailSettings);
router.put('/settings', notificationController.updateEmailSettings);

/**
 * @swagger
 * /email/test:
 *   post:
 *     summary: Enviar e-mail de teste para o endereço configurado
 *     tags: [E-mail]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: E-mail de teste enviado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: E-mail não configurado ou serviço indisponível
 */
router.post('/test', notificationController.sendTestEmail);

/**
 * @swagger
 * /email/status:
 *   get:
 *     summary: Verificar status do serviço de e-mail (conectividade SMTP)
 *     tags: [E-mail]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status do serviço de e-mail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, error]
 *                 message:
 *                   type: string
 */
router.get('/status', Auth.RequireRole(['master']), notificationController.checkEmailServiceStatus);

/**
 * @swagger
 * /email/validate:
 *   post:
 *     summary: Validar se um endereço de e-mail possui registro MX válido
 *     tags: [E-mail]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Resultado da validação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/validate', notificationController.validateEmail);

export default router;

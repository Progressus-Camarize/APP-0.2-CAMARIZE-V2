import express from 'express';
import Auth from '../middleware/Auth.js';
import {
  getMyConversations,
  createConversation,
  getMessages,
  sendMessage,
  deleteConversation
} from '../controllers/chatController.js';

const router = express.Router();

router.use(Auth.Authorization);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Endpoints de mensagens e conversas entre usuários
 */

/**
 * @swagger
 * /chat/conversations/mine:
 *   get:
 *     summary: Listar conversas do usuário autenticado
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de conversas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Conversation'
 */
router.get('/conversations/mine', getMyConversations);

/**
 * @swagger
 * /chat/conversations:
 *   post:
 *     summary: Criar nova conversa entre dois usuários
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - adminId
 *               - masterId
 *             properties:
 *               adminId:
 *                 type: string
 *                 description: ID do usuário admin
 *               masterId:
 *                 type: string
 *                 description: ID do usuário master
 *     responses:
 *       201:
 *         description: Conversa criada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       200:
 *         description: Conversa já existente retornada
 */
router.post('/conversations', createConversation);

/**
 * @swagger
 * /chat/conversations/{id}/messages:
 *   get:
 *     summary: Listar mensagens de uma conversa
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da conversa
 *     responses:
 *       200:
 *         description: Lista de mensagens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       403:
 *         description: Usuário não participa da conversa
 *       404:
 *         description: Conversa não encontrada
 */
router.get('/conversations/:id/messages', getMessages);

/**
 * @swagger
 * /chat/conversations/{id}/messages:
 *   post:
 *     summary: Enviar mensagem em uma conversa
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da conversa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: Temperatura do viveiro A1 está alta!
 *     responses:
 *       201:
 *         description: Mensagem enviada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       403:
 *         description: Usuário não participa da conversa
 */
router.post('/conversations/:id/messages', sendMessage);

/**
 * @swagger
 * /chat/conversations/{id}:
 *   delete:
 *     summary: Excluir uma conversa e todas as suas mensagens
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da conversa
 *     responses:
 *       200:
 *         description: Conversa excluída com sucesso
 *       403:
 *         description: Usuário não participa da conversa
 *       404:
 *         description: Conversa não encontrada
 */
router.delete('/conversations/:id', deleteConversation);

export default router;

import express from "express";
const fazendaRoutes = express.Router();
import fazendaController from "../controllers/fazendaController.js";
import Auth from '../middleware/Auth.js';
import Cache from '../middleware/cache.js';

/**
 * @swagger
 * tags:
 *   name: Fazendas
 *   description: Gerenciamento de fazendas/sítios aquícolas
 */

/**
 * @swagger
 * /fazendas/public:
 *   get:
 *     summary: Listar todas as fazendas (público) — usado no cadastro de funcionário
 *     tags: [Fazendas]
 *     responses:
 *       200:
 *         description: Lista de fazendas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Fazenda'
 */
fazendaRoutes.get("/public", Auth.Authorization, Auth.RequireRole(['master']), Cache.cacheControl(120, 180), fazendaController.getAllFazendasPublic);

/**
 * @swagger
 * /fazendas:
 *   post:
 *     summary: Criar uma nova fazenda
 *     tags: [Fazendas]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FazendaCreate'
 *     responses:
 *       201:
 *         description: Fazenda criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Fazenda'
 *       401:
 *         description: Não autenticado
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
fazendaRoutes.post("/", Auth.Authorization, Auth.RequireRole(['master']), fazendaController.createFazenda);

/**
 * @swagger
 * /fazendas:
 *   get:
 *     summary: Listar fazendas do usuário autenticado (master vê todas)
 *     tags: [Fazendas]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de fazendas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Fazenda'
 *       401:
 *         description: Não autenticado
 */
fazendaRoutes.get("/", Auth.Authorization, Cache.cacheControl(120, 180), fazendaController.getAllFazendas);

/**
 * @swagger
 * /fazendas/{id}:
 *   get:
 *     summary: Buscar fazenda por ID
 *     tags: [Fazendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da fazenda
 *     responses:
 *       200:
 *         description: Dados da fazenda
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Fazenda'
 *       404:
 *         description: Fazenda não encontrada
 */
fazendaRoutes.get("/:id", Auth.Authorization, Cache.cacheControl(120, 180), fazendaController.getFazendaById);

/**
 * @swagger
 * /fazendas/{id}:
 *   patch:
 *     summary: Atualizar dados de uma fazenda — requer role master
 *     tags: [Fazendas]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da fazenda
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               rua:
 *                 type: string
 *               bairro:
 *                 type: string
 *               cidade:
 *                 type: string
 *               numero:
 *                 type: number
 *     responses:
 *       200:
 *         description: Fazenda atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Fazenda'
 *       403:
 *         description: Sem permissão (apenas master)
 *       404:
 *         description: Fazenda não encontrada
 *   delete:
 *     summary: Remover fazenda e seus vínculos — requer role master
 *     tags: [Fazendas]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da fazenda
 *     responses:
 *       200:
 *         description: Fazenda removida com sucesso
 *       403:
 *         description: Sem permissão (apenas master)
 *       404:
 *         description: Fazenda não encontrada
 */
fazendaRoutes.patch("/:id", Auth.Authorization, Auth.RequireRole(['master']), fazendaController.updateFazenda);
fazendaRoutes.delete("/:id", Auth.Authorization, Auth.RequireRole(['master']), fazendaController.deleteFazenda);

/**
 * @swagger
 * /fazendas/{id}/foto:
 *   patch:
 *     summary: Atualizar foto da fazenda
 *     tags: [Fazendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               foto:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Foto atualizada com sucesso
 *       400:
 *         description: Nenhuma foto enviada
 *   get:
 *     summary: Obter foto da fazenda
 *     tags: [Fazendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Imagem da fazenda
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Sem foto cadastrada
 */
fazendaRoutes.patch("/:id/foto", Auth.Authorization, fazendaController.updateFotoFazenda);
fazendaRoutes.get("/:id/foto", Auth.Authorization, fazendaController.getFotoFazenda);

export default fazendaRoutes;

import express from "express";
import Auth from "../middleware/Auth.js";
import Cache from '../middleware/cache.js';
import dietaController from "../controllers/dietaController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Dietas
 *   description: Planos de alimentação dos viveiros — criação, atribuição e controle
 */

/**
 * @swagger
 * /dietas/atual/{cativeiroId}:
 *   get:
 *     summary: Obter dieta ativa de um viveiro — público (usado pelo ESP32)
 *     tags: [Dietas]
 *     description: Endpoint público consultado pelo ESP32 para saber o horário e quantidade de alimentação do viveiro.
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Dieta ativa do viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dieta'
 *       404:
 *         description: Nenhuma dieta ativa para este viveiro
 */
router.get("/atual/:cativeiroId", Cache.cacheControl(60, 120), dietaController.getDietaAtual);

/**
 * @swagger
 * /dietas:
 *   post:
 *     summary: Criar nova dieta — requer role admin ou master
 *     tags: [Dietas]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DietaCreate'
 *     responses:
 *       201:
 *         description: Dieta criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dieta'
 *       403:
 *         description: Sem permissão
 *   get:
 *     summary: Listar todas as dietas — requer role master
 *     tags: [Dietas]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de dietas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dieta'
 *       403:
 *         description: Sem permissão (apenas master)
 */
router.post("/", Auth.Authorization, Auth.RequireRole(['admin','master']), dietaController.createDieta);
router.get("/", Auth.Authorization, Auth.RequireRole(['master']), Cache.cacheControl(120, 180), dietaController.listDietas);

/**
 * @swagger
 * /dietas/{id}:
 *   put:
 *     summary: Atualizar dieta — requer role admin ou master
 *     tags: [Dietas]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DietaCreate'
 *     responses:
 *       200:
 *         description: Dieta atualizada
 *       404:
 *         description: Dieta não encontrada
 *   delete:
 *     summary: Excluir dieta — requer role master
 *     tags: [Dietas]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dieta excluída
 *       403:
 *         description: Sem permissão (apenas master)
 *       404:
 *         description: Dieta não encontrada
 */
// Dieta é compartilhada entre cativeiros de fazendas diferentes: só o master edita
router.put("/:id", Auth.Authorization, Auth.RequireRole(['master']), dietaController.updateDieta);
router.delete("/:id", Auth.Authorization, Auth.RequireRole(['master']), dietaController.deleteDieta);

/**
 * @swagger
 * /dietas/assign/{cativeiroId}:
 *   post:
 *     summary: Atribuir dieta a um viveiro — requer role admin ou master
 *     tags: [Dietas]
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
 *             required: [dietaId]
 *             properties:
 *               dietaId:
 *                 type: string
 *                 description: ID da dieta a ser atribuída
 *     responses:
 *       200:
 *         description: Dieta atribuída com sucesso
 *       404:
 *         description: Viveiro ou dieta não encontrada
 */
router.post("/assign/:cativeiroId", Auth.Authorization, Auth.RequireRole(['admin','master']), dietaController.assignDietaToCativeiro);

export default router;

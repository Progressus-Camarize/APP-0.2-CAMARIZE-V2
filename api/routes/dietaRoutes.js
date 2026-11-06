import express from "express";
import Auth from "../middleware/Auth.js";
import Cache from '../middleware/cache.js';
import dietaController from "../controllers/dietaController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Dietas
 *   description: Dieta de cada viveiro (uma por cativeiro) — consulta do ESP32 e gestão pelo master
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
// Sem cache: depois de aprovada uma dieta, as telas e o ESP32 precisam ver a versão nova na hora
router.get("/atual/:cativeiroId", Cache.noStore, dietaController.getDietaAtual);

/**
 * @swagger
 * /dietas/fazendas:
 *   get:
 *     summary: Master — todas as fazendas com os cativeiros e a dieta de cada um
 *     tags: [Dietas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "[{ _id, nome, cativeiros: [{ _id, nome, dieta: { descricao, quantidade, horarios, quantidadeRefeicoes } | null }] }]; cativeiros sem fazenda vêm no grupo \"Sem fazenda\" (_id null)"
 *       403: { description: Apenas master }
 */
router.get("/fazendas", Auth.Authorization, Auth.RequireRole(['master']), Cache.noStore, dietaController.visaoPorFazenda);

/**
 * @swagger
 * /dietas/cativeiro/{cativeiroId}:
 *   put:
 *     summary: Master — define a dieta do cativeiro (cria ou edita a dele, sem solicitação)
 *     tags: [Dietas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cativeiroId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantidade, horarios]
 *             properties:
 *               descricao: { type: string, example: "Engorda" }
 *               quantidade: { type: number, description: "Gramas por refeição", example: 25 }
 *               horarios: { type: array, items: { type: string }, example: ["08:00", "17:00"] }
 *     responses:
 *       200: { description: Dieta do cativeiro }
 *       400: { description: Quantidade ou horários inválidos }
 *       404: { description: Cativeiro não encontrado }
 *   delete:
 *     summary: Master — remove a dieta do cativeiro (o alimentador para de servir)
 *     tags: [Dietas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cativeiroId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Dieta removida }
 *       404: { description: Cativeiro sem dieta }
 */
router.put("/cativeiro/:cativeiroId", Auth.Authorization, Auth.RequireRole(['master']), dietaController.definirDieta);
router.delete("/cativeiro/:cativeiroId", Auth.Authorization, Auth.RequireRole(['master']), dietaController.removerDieta);

export default router;

import express from "express";
import Auth from "../middleware/Auth.js";
import Cache from "../middleware/cache.js";
import alimentacaoController from "../controllers/alimentacaoController.js";

const router = express.Router();

/**
 * @swagger
 * /alimentacoes:
 *   post:
 *     summary: ESP32 informa uma refeição programada (servida ou não) — exige X-Device-Key
 *     tags: [Alimentações]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_cativeiro, data, horario, status]
 *             properties:
 *               id_cativeiro: { type: string }
 *               data: { type: string, example: "2026-11-06" }
 *               horario: { type: string, example: "08:00" }
 *               status: { type: string, enum: [servida, falhou] }
 *               gramas: { type: number, example: 10 }
 *               rotacoes: { type: number, example: 2.5 }
 *               atraso_min: { type: integer, example: 0 }
 *               motivo: { type: string, example: "Alimentador sem calibração" }
 *     responses:
 *       201: { description: Refeição registrada }
 *       200: { description: Registro do mesmo dia e horário atualizado (uma refeição servida não volta a "falhou") }
 *       400: { description: Dados inválidos }
 *       401: { description: Chave do dispositivo inválida ou ausente }
 */
router.post("/", alimentacaoController.registrarAlimentacao);

/**
 * @swagger
 * /alimentacoes/hoje:
 *   get:
 *     summary: Resumo de hoje (dieta, gramas servidos e próximo horário) de cada cativeiro do usuário
 *     tags: [Alimentações]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data, cativeiros: { [id]: { dieta, gramasPrevistas, gramasServidas, refeicoesServidas, refeicoesPrevistas, proximo } } }" }
 */
router.get("/hoje", Auth.Authorization, Cache.noStore, alimentacaoController.resumoDeHoje);

/**
 * @swagger
 * /alimentacoes/{cativeiroId}:
 *   get:
 *     summary: Refeições de um dia do cativeiro (padrão hoje, horário de Brasília)
 *     tags: [Alimentações]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cativeiroId, required: true, schema: { type: string } }
 *       - { in: query, name: data, schema: { type: string, example: "2026-11-06" } }
 *     responses:
 *       200: { description: "{ cativeiroId, data, alimentacoes: [...] }" }
 *       403: { description: Sem acesso ao cativeiro }
 *       404: { description: Cativeiro não encontrado }
 */
router.get("/:cativeiroId", Auth.Authorization, Cache.noStore, alimentacaoController.listarAlimentacoes);

export default router;

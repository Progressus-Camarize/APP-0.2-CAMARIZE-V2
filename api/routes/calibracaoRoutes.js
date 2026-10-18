import express from "express";
import Auth from "../middleware/Auth.js";
import calibracaoController from "../controllers/calibracaoController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Calibração
 *   description: Calibração de hardware do ESP32 — motor 28BYJ-48 (gramas por rotação) e sensor de pH PH-4502C (tensão em pH 7/4)
 */

/**
 * @swagger
 * /calibracao/iniciar:
 *   post:
 *     summary: Iniciar calibração de motor ou pH — requer role admin ou master
 *     tags: [Calibração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Calibração iniciada
 *       409:
 *         description: Já existe calibração ativa no cativeiro
 */
router.post("/iniciar", Auth.Authorization, calibracaoController.iniciarCalibracao);

/**
 * @swagger
 * /calibracao/atual/{cativeiroId}:
 *   get:
 *     summary: Consultar calibração pendente de um cativeiro — público (usado pelo ESP32)
 *     tags: [Calibração]
 *     description: Rota de polling, somente leitura, sem efeitos colaterais.
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado atual da calibração (ou ativa=false se não houver)
 *       404:
 *         description: Cativeiro não encontrado
 */
router.get("/atual/:cativeiroId", calibracaoController.getCalibracaoAtual);

/**
 * @swagger
 * /calibracao/resultado:
 *   post:
 *     summary: Enviar resultado de uma etapa da calibração — ESP32 (executar/ph7/ph4) ou Aplicação (peso)
 *     tags: [Calibração]
 *     responses:
 *       200:
 *         description: Resultado registrado e estado avançado
 *       409:
 *         description: Sem calibração ativa, ou tipo/etapa diferente do estado atual
 */
router.post("/resultado", calibracaoController.registrarResultado);

/**
 * @swagger
 * /calibracao/cancelar:
 *   post:
 *     summary: Cancelar a calibração ativa do cativeiro — requer role admin ou master
 *     tags: [Calibração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Calibração cancelada
 *       404:
 *         description: Nenhuma calibração ativa para o cativeiro
 */
router.post("/cancelar", Auth.Authorization, calibracaoController.cancelarCalibracao);

export default router;

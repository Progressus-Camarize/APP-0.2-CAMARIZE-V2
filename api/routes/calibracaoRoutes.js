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
// A etapa "peso" é enviada pela aplicação e exige login; as demais vêm do ESP32 com X-Device-Key
const loginNaPesagem = (req, res, next) =>
  req.body?.etapa === "peso" ? Auth.Authorization(req, res, next) : next();
router.post("/resultado", loginNaPesagem, calibracaoController.registrarResultado);

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

/**
 * @swagger
 * /calibracao/confirmar:
 *   post:
 *     summary: Confirma que o eletrodo está na solução de pH 7 ou pH 4
 *     description: Avança a calibração de pH de preparar_ph7 para ph7 (ou de preparar_ph4 para ph4). Só depois disso o ESP32 lê a tensão.
 *     tags: [Calibração]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_cativeiro]
 *             properties:
 *               id_cativeiro:
 *                 type: string
 *     responses:
 *       200:
 *         description: Etapa confirmada
 *       409:
 *         description: Não há etapa aguardando confirmação
 */
router.post("/confirmar", Auth.Authorization, calibracaoController.confirmarEtapa);

export default router;

import express from "express";
import SensoresxCativeiros from "../models/SensoresxCativeiros.js";
import Cache from '../middleware/cache.js';
import mongoose from "mongoose";
import Auth from '../middleware/Auth.js';
import Sensores from "../models/Sensores.js";
import cativeiroController from "../controllers/cativeiroController.js";

const router = express.Router();

router.use(Auth.Authorization);

// Admin só vincula/desvincula os próprios sensores em cativeiros das fazendas dele; master, qualquer um
const podeAlterarVinculo = async (loggedUser, id_sensor, id_cativeiro) => {
  if (!mongoose.isValidObjectId(id_sensor) || !mongoose.isValidObjectId(id_cativeiro)) return false;
  if (!(await cativeiroController.assertCativeiroAccess(id_cativeiro, loggedUser.id, loggedUser.role))) return false;
  if (loggedUser.role === 'master') return true;
  return !!(await Sensores.exists({ _id: id_sensor, user: loggedUser.id }));
};

/**
 * @swagger
 * tags:
 *   name: Sensores × Cativeiros
 *   description: Associação entre sensores e viveiros
 */

/**
 * @swagger
 * /sensoresxcativeiros:
 *   get:
 *     summary: Listar todas as associações sensor–viveiro
 *     tags: [Sensores × Cativeiros]
 *     responses:
 *       200:
 *         description: Lista de associações com dados populados de sensor e viveiro
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SensorCativeiro'
 *   post:
 *     summary: Criar associação entre sensor e viveiro
 *     tags: [Sensores × Cativeiros]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_sensor, id_cativeiro]
 *             properties:
 *               id_sensor:
 *                 type: string
 *                 description: ID do sensor
 *               id_cativeiro:
 *                 type: string
 *                 description: ID do viveiro
 *     responses:
 *       201:
 *         description: Associação criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SensorCativeiro'
 *       400:
 *         description: Dados inválidos
 *   delete:
 *     summary: Remover associação sensor–viveiro pelo par de IDs
 *     tags: [Sensores × Cativeiros]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_sensor, id_cativeiro]
 *             properties:
 *               id_sensor:
 *                 type: string
 *               id_cativeiro:
 *                 type: string
 *     responses:
 *       200:
 *         description: Associação removida com sucesso
 *       400:
 *         description: id_sensor e id_cativeiro são obrigatórios
 *       404:
 *         description: Associação não encontrada
 */
router.get("/", Auth.RequireRole(['master']), Cache.cacheControl(120, 180), async (req, res) => {
  try {
    const sensoresxCativeiros = await SensoresxCativeiros.find()
      .populate('id_sensor')
      .populate('id_cativeiro');
    res.json(sensoresxCativeiros);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", Auth.RequireRole(['admin', 'master']), async (req, res) => {
  try {
    const { id_sensor, id_cativeiro } = req.body;
    if (!(await podeAlterarVinculo(req.loggedUser, id_sensor, id_cativeiro))) {
      return res.status(403).json({ message: "Sem permissão para vincular este sensor a este cativeiro" });
    }
    const novaRelacao = new SensoresxCativeiros({ id_sensor, id_cativeiro });
    const relacaoSalva = await novaRelacao.save();
    res.status(201).json(relacaoSalva);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/", Auth.RequireRole(['admin', 'master']), async (req, res) => {
  try {
    const { id_sensor, id_cativeiro } = req.body;
    if (!id_sensor || !id_cativeiro) {
      return res.status(400).json({ message: "id_sensor e id_cativeiro são obrigatórios" });
    }
    if (!(await podeAlterarVinculo(req.loggedUser, id_sensor, id_cativeiro))) {
      return res.status(403).json({ message: "Sem permissão para remover este vínculo" });
    }
    const result = await SensoresxCativeiros.deleteOne({ id_sensor, id_cativeiro });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Relação não encontrada" });
    }
    res.json({ message: "Relação removida com sucesso" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

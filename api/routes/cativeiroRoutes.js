import express from "express";
const cativeiroRoutes = express.Router();
import cativeiroController from "../controllers/cativeiroController.js";
import Cativeiros from "../models/Cativeiros.js";
import multer from 'multer';
const upload = multer();
import Auth from '../middleware/Auth.js';
import Cache from '../middleware/cache.js';

/**
 * @swagger
 * tags:
 *   name: Cativeiros
 *   description: Gerenciamento de viveiros/tanques de camarão
 */

/**
 * @swagger
 * /cativeiros:
 *   post:
 *     summary: Criar novo viveiro
 *     tags: [Cativeiros]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nome, id_tipo_camarao, data_instalacao]
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Viveiro A1
 *               id_tipo_camarao:
 *                 type: string
 *               data_instalacao:
 *                 type: string
 *                 format: date
 *               foto_cativeiro:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Viveiro criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cativeiro'
 *       401:
 *         description: Não autenticado
 */
cativeiroRoutes.post("/cativeiros", Auth.Authorization, Auth.RequireRole(['admin', 'master']), upload.single('foto_cativeiro'), cativeiroController.createCativeiro);

/**
 * @swagger
 * /cativeiros:
 *   get:
 *     summary: Listar todos os viveiros do usuário autenticado
 *     tags: [Cativeiros]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de viveiros
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Cativeiro'
 *       401:
 *         description: Não autenticado
 */
cativeiroRoutes.get("/cativeiros", Auth.Authorization, Cache.cacheControl(60, 120), cativeiroController.getAllCativeiros);

/**
 * @swagger
 * /cativeiros-status:
 *   get:
 *     summary: Obter status geral de todos os viveiros (resumo para dashboard)
 *     tags: [Cativeiros]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status dos viveiros com médias de temperatura, pH e amônia
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   cativeiro:
 *                     $ref: '#/components/schemas/Cativeiro'
 *                   ultimosParametros:
 *                     $ref: '#/components/schemas/ParametroAtual'
 *                   status:
 *                     type: string
 *                     enum: [normal, alerta, critico]
 */
cativeiroRoutes.get("/cativeiros-status", Auth.Authorization, Cache.cacheControl(60, 120), cativeiroController.getCativeirosStatus);

/**
 * @swagger
 * /cativeiros/{id}:
 *   get:
 *     summary: Buscar viveiro por ID
 *     tags: [Cativeiros]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do viveiro
 *     responses:
 *       200:
 *         description: Dados do viveiro
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cativeiro'
 *       404:
 *         description: Viveiro não encontrado
 */
cativeiroRoutes.get("/cativeiros/:id", Auth.Authorization, Cache.cacheControl(60, 120), cativeiroController.getCativeiroById);

/**
 * @swagger
 * /cativeiros/{cativeiroId}/sensores:
 *   get:
 *     summary: Listar sensores associados a um viveiro
 *     tags: [Cativeiros]
 *     parameters:
 *       - in: path
 *         name: cativeiroId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de sensores do viveiro
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sensor'
 */
cativeiroRoutes.get("/cativeiros/:cativeiroId/sensores", Auth.Authorization, Cache.cacheControl(60, 120), cativeiroController.getSensoresCativeiro);

/**
 * @swagger
 * /tipos-camarao:
 *   get:
 *     summary: Listar todos os tipos de camarão disponíveis
 *     tags: [Cativeiros]
 *     responses:
 *       200:
 *         description: Lista de tipos de camarão
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TipoCamarao'
 */
cativeiroRoutes.get("/tipos-camarao", Auth.Authorization, Cache.cacheControl(120, 180), cativeiroController.getAllTiposCamarao);

/**
 * @swagger
 * /condicoes-ideais:
 *   get:
 *     summary: Listar condições ideais por tipo de camarão
 *     tags: [Cativeiros]
 *     responses:
 *       200:
 *         description: Lista de condições ideais
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CondicoesIdeais'
 */
cativeiroRoutes.get("/condicoes-ideais", Auth.Authorization, Cache.cacheControl(120, 180), cativeiroController.getAllCondicoesIdeais);

/**
 * @swagger
 * /cativeiros/{id}:
 *   put:
 *     summary: Atualizar viveiro completamente (substituição total)
 *     tags: [Cativeiros]
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CativeiroCreate'
 *     responses:
 *       200:
 *         description: Viveiro atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cativeiro'
 *       404:
 *         description: Viveiro não encontrado
 *   patch:
 *     summary: Atualizar viveiro parcialmente
 *     tags: [Cativeiros]
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
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               id_tipo_camarao:
 *                 type: string
 *               data_instalacao:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Viveiro atualizado
 *       404:
 *         description: Viveiro não encontrado
 *   delete:
 *     summary: Excluir viveiro
 *     tags: [Cativeiros]
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
 *         description: Viveiro excluído com sucesso
 *       404:
 *         description: Viveiro não encontrado
 */
cativeiroRoutes.put("/cativeiros/:id", Auth.Authorization, Auth.RequireRole(['admin', 'master']), upload.single('foto_cativeiro'), cativeiroController.updateCativeiro);
cativeiroRoutes.patch("/cativeiros/:id", Auth.Authorization, Auth.RequireRole(['admin', 'master']), cativeiroController.updateCativeiro);
cativeiroRoutes.delete("/cativeiros/:id", Auth.Authorization, Auth.RequireRole(['admin', 'master']), cativeiroController.deleteCativeiro);

/**
 * @swagger
 * /cativeiros/{id}/foto:
 *   post:
 *     summary: Atualizar foto do viveiro — requer role admin ou master
 *     tags: [Cativeiros]
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
 *       403:
 *         description: Apenas admin e master podem alterar a foto
 *   get:
 *     summary: Obter foto do viveiro
 *     tags: [Cativeiros]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Imagem do viveiro
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Sem foto cadastrada
 */
cativeiroRoutes.post("/cativeiros/:id/foto", Auth.Authorization, upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.loggedUser || (req.loggedUser.role !== 'admin' && req.loggedUser.role !== 'master')) {
      return res.status(403).json({ error: "Apenas administradores e masters podem alterar a foto do cativeiro." });
    }

    const acesso = await cativeiroController.assertCativeiroAccess(id, req.loggedUser.id, req.loggedUser.role);
    if (acesso === null) return res.status(404).json({ error: "Cativeiro não encontrado." });
    if (!acesso) return res.status(403).json({ error: "Acesso negado a este cativeiro." });

    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma foto foi enviada." });
    }

    // Só a foto: os demais campos do cativeiro mudam pelo PATCH, que valida o acesso e os campos
    await cativeiroController.updateCativeiroData(id, { foto_cativeiro: req.file.buffer });

    res.status(200).json({ message: "Foto do cativeiro atualizada com sucesso!" });
  } catch (error) {
    console.error('Erro ao atualizar foto do cativeiro:', error);
    res.status(500).json({ error: "Erro ao atualizar foto do cativeiro." });
  }
});

// Aceita o token por header ou ?token= (a foto é carregada por <img>, que não envia header)
cativeiroRoutes.get("/cativeiros/:id/foto", Auth.AuthorizationSSE, async (req, res) => {
  try {
    const { id } = req.params;
    const acesso = await cativeiroController.assertCativeiroAccess(id, req.loggedUser.id, req.loggedUser.role);
    if (!acesso) return res.status(404).send("Sem foto");
    const cativeiro = await Cativeiros.findById(id).select('foto_cativeiro');

    if (!cativeiro || !cativeiro.foto_cativeiro) {
      return res.status(404).send("Sem foto");
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.send(cativeiro.foto_cativeiro);
  } catch (error) {
    console.error('Erro ao buscar foto do cativeiro:', error);
    res.status(500).send("Erro ao buscar foto do cativeiro");
  }
});

export default cativeiroRoutes;

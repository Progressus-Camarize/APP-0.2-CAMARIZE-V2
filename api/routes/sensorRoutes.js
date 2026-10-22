import express from "express";
const sensorRoutes = express.Router();
import sensorController from "../controllers/sensorController.js";
import multer from 'multer';
import Auth from "../middleware/Auth.js";
import Cache from '../middleware/cache.js';

const upload = multer();

/**
 * @swagger
 * tags:
 *   name: Sensores
 *   description: Gerenciamento de sensores IoT (ESP32)
 */

/**
 * @swagger
 * /sensores:
 *   post:
 *     summary: Cadastrar novo sensor
 *     tags: [Sensores]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [id_tipo_sensor]
 *             properties:
 *               id_tipo_sensor:
 *                 type: string
 *                 description: ID do tipo de sensor
 *               apelido:
 *                 type: string
 *                 example: Sensor Viveiro A1
 *               foto_sensor:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Sensor criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sensor'
 *       401:
 *         description: Não autenticado
 *   get:
 *     summary: Listar todos os sensores do usuário autenticado
 *     tags: [Sensores]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sensores
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sensor'
 *       401:
 *         description: Não autenticado
 */
sensorRoutes.post("/sensores", Auth.Authorization, Auth.RequireRole(['admin', 'master']), upload.single('foto_sensor'), sensorController.createSensor);
sensorRoutes.get("/sensores", Auth.Authorization, Cache.cacheControl(60, 120), sensorController.getAllSensores);

/**
 * @swagger
 * /sensores/{id}:
 *   get:
 *     summary: Buscar sensor por ID
 *     tags: [Sensores]
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
 *         description: Dados do sensor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sensor'
 *       404:
 *         description: Sensor não encontrado
 *   put:
 *     summary: Atualizar sensor
 *     tags: [Sensores]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               id_tipo_sensor:
 *                 type: string
 *               apelido:
 *                 type: string
 *               foto_sensor:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Sensor atualizado
 *       404:
 *         description: Sensor não encontrado
 *   delete:
 *     summary: Excluir sensor
 *     tags: [Sensores]
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
 *         description: Sensor excluído com sucesso
 *       404:
 *         description: Sensor não encontrado
 */
sensorRoutes.get("/sensores/:id", Auth.Authorization, Cache.cacheControl(60, 120), sensorController.getSensorById);
sensorRoutes.put("/sensores/:id", Auth.Authorization, Auth.RequireRole(['admin', 'master']), upload.single('foto_sensor'), sensorController.updateSensor);
sensorRoutes.delete("/sensores/:id", Auth.Authorization, Auth.RequireRole(['admin', 'master']), sensorController.deleteSensor);

export default sensorRoutes;

import requestRoutes from './routes/requestRoutes.js';
import { BlockMembersWrite } from './middleware/Auth.js';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger/swaggerConfig.js";


import userRoutes from './routes/userRoutes.js';
import fazendaRoutes from './routes/fazendaRoutes.js';
import cativeiroRoutes from './routes/cativeiroRoutes.js';
import camaraoRoutes from './routes/camaraoRoutes.js';
import sensorRoutes from './routes/sensorRoutes.js';
import usuariosxFazendasRoutes from './routes/usuariosxFazendasRoutes.js';
import sensoresxCativeirosRoutes from './routes/sensoresxCativeirosRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import parametrosRoutes from './routes/parametrosRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import dietaRoutes from './routes/dietaRoutes.js';
import calibracaoRoutes from './routes/calibracaoRoutes.js';


// Carrega todos os modelos para garantir que as coleções sejam criadas
import './models/SensoresxCativeiros.js';
import './models/FazendasxCativeiros.js';
import './models/UsuariosxFazendas.js';

export function createApp({ isDatabaseReady = () => mongoose.connection.readyState === 1 } = {}) {
  const app = express();

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cache-Control"]
  }));



  // 🧠 Esses dois devem vir ANTES das rotas
  app.use(express.json({ limit: '10mb'}));
  app.use(express.urlencoded({ extended: false }));

  // 🧪 Log básico para cada requisição
  app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'test') console.log('Rota acessada:', req.method, req.path);
    next();
  });

  // ✅ Rota raiz para health check
  app.get('/', (req, res) => {
    res.json({
      message: '🚀 API Camarize funcionando!',
      status: 'online',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // ✅ Rota de health check
  app.get('/api/health', (req, res) => {
    const ready = isDatabaseReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'healthy' : 'unavailable',
      database: ready ? 'connected' : 'disconnected',
      commit: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || 'local',
      timestamp: new Date().toISOString()
    });
  });

  // ✅ Documentação Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Camarize API Docs',
    explorer: true,
  }));

  // Endpoint para baixar o spec em JSON (útil para importar no Postman/Insomnia)
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // ✅ Registra as rotas
  app.use('/users', userRoutes);
  app.use('/fazendas', fazendaRoutes);
  app.use('/', cativeiroRoutes);
  app.use('/', camaraoRoutes);
  app.use('/', sensorRoutes);
  app.use('/usuariosxfazendas', usuariosxFazendasRoutes);
  app.use('/sensoresxcativeiros', sensoresxCativeirosRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/email', emailRoutes);
  app.use('/parametros', parametrosRoutes);
  app.use('/chat', chatRoutes);
  app.use('/dietas', dietaRoutes);
  app.use('/calibracao', calibracaoRoutes);
  // Bloqueio global de escrita para membros (exceto /requests)
  app.use(BlockMembersWrite);
  app.use('/requests', requestRoutes);

  return app;
}

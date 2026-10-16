import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import monitoringService from './services/monitoringService.js';

const port = Number(process.env.PORT || 4000);
const mongoUrl = process.env.MONGO_URL;
let server;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  monitoringService.stopMonitoring();
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  clearTimeout(deadline);
}

process.once('SIGTERM', () => stop().catch(() => process.exit(1)));
process.once('SIGINT', () => stop().catch(() => process.exit(1)));

try {
  if (!mongoUrl) throw new Error('MONGO_URL não definida em api/.env. Configure a URI privada do MongoDB Atlas.');
  await mongoose.connect(mongoUrl, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
  });
  server = createApp().listen(port, '0.0.0.0', () => {
    console.log(`API Camarize pronta na porta ${port}`);
    if (process.env.ENABLE_AUTO_MONITORING !== 'false') {
      const interval = Number(process.env.MONITORING_INTERVAL_MINUTES || 5);
      monitoringService.startMonitoring(Number.isFinite(interval) && interval > 0 ? interval : 5);
    }
  });
  server.on('error', error => {
    console.error('Falha ao iniciar servidor:', error.message);
    stop().finally(() => { process.exitCode = 1; });
  });
} catch (error) {
  console.error('Falha ao iniciar API:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
}

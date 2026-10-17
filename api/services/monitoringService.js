import Cativeiros from '../models/Cativeiros.js';
import { processReading, checkSensorInativo, deliverPending } from './avisoService.js';

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.lastCheck = null;
  }

  startMonitoring(intervalMinutes = 5) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.performCheck().catch(error => console.error('Erro no monitoramento:', error));
    this.checkInterval = setInterval(() => {
      this.performCheck().catch(error => console.error('Erro no monitoramento:', error));
    }, intervalMinutes * 60_000);
  }

  stopMonitoring() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = null;
    this.isRunning = false;
  }

  getStatus() {
    return { isRunning: this.isRunning, lastCheck: this.lastCheck };
  }

  async performCheck() {
    this.lastCheck = new Date();
    // Cobre leituras recebidas antes de um reinício ou cujo processamento foi interrompido.
    const cativeiros = await Cativeiros.find().select('_id').lean();
    for (const cativeiro of cativeiros) {
      await processReading(cativeiro._id, this.lastCheck);
      await checkSensorInativo(cativeiro._id, this.lastCheck);
    }
    await deliverPending();
  }

  async manualCheck() { await this.performCheck(); }
}

export default new MonitoringService();

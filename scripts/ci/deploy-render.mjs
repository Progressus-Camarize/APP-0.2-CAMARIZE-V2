import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const failedStatuses = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated']);

export async function deployRender({ token, serviceId, commit, request = fetch, sleep = pause, attempts = 90 }) {
  if (!token || !/^srv-[a-z0-9]+$/.test(serviceId || '') || !/^[a-f0-9]{40}$/.test(commit || '')) {
    throw new Error('Configure RENDER_API_KEY, RENDER_SERVICE_ID e um commit SHA completo.');
  }
  const url = `https://api.render.com/v1/services/${serviceId}/deploys`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function api(path, options = {}) {
    const response = await request(path, { ...options, headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Render API respondeu HTTP ${response.status}.`);
    return response.json();
  }
  const previous = await api(`${url}?limit=20`);
  const live = previous.map(item => item.deploy).find(deploy => deploy?.status === 'live');
  const deployment = await api(url, { method: 'POST', body: JSON.stringify({ commitId: commit }) });
  if (!deployment.id) throw new Error('Render não retornou o ID do deploy.');
  console.log(`Deploy Render iniciado: ${deployment.id}`);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await api(`${url}/${deployment.id}`);
    if (failedStatuses.has(current.status)) throw new Error(`Deploy Render falhou: ${current.status}.`);
    if (current.status === 'live') {
      if (current.commit?.id !== commit) throw new Error('Render publicou um commit diferente do aprovado.');
      return { deploymentId: current.id, previousCommit: live?.commit?.id || '' };
    }
    await sleep(10000);
  }
  throw new Error('Tempo limite aguardando deploy Render. Consulte o deploy antes de tentar novamente.');
}

export async function waitForHealth({ apiURL, commit, request = fetch, sleep = pause, attempts = 18 }) {
  const url = new URL('/api/health', apiURL);
  if (url.protocol !== 'https:') throw new Error('API_URL de publicação deve usar HTTPS.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const health = await response.json();
        if (health.database === 'connected' && health.status === 'healthy' && health.commit === commit) return;
      }
    } catch { /* cold start ou conexão temporariamente indisponível */ }
    await sleep(10000);
  }
  throw new Error('Readiness não confirmou banco conectado e commit esperado. Frontend não será publicado.');
}

async function main() {
  const apiURL = new URL(process.env.API_URL);
  if (apiURL.protocol !== 'https:') throw new Error('API_URL de publicação deve usar HTTPS.');
  const result = await deployRender({ token: process.env.RENDER_API_KEY,
    serviceId: process.env.RENDER_SERVICE_ID, commit: process.env.GITHUB_SHA });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\nRender deploy: ${result.deploymentId}\n\nCommit anterior: ${result.previousCommit || 'indisponível'}\n`);
  await waitForHealth({ apiURL: process.env.API_URL, commit: process.env.GITHUB_SHA });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

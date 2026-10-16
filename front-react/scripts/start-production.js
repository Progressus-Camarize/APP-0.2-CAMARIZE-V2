const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');
const server = path.join(standalone, 'server.js');
if (!fs.existsSync(server)) {
  throw new Error('Execute npm run build antes de iniciar o frontend de produção.');
}
fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
require(server);

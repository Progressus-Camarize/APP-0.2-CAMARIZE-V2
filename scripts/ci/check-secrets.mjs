import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

// Verifica o checkout atual. Credenciais removidas do histórico ainda devem ser rotacionadas.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const patterns = [
  /mongodb(?:\+srv)?:\/\/[^\s:/"']+:[^\s@"']+@/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /^\s*authtoken:\s*[A-Za-z0-9]{20,}/m,
  /^\s*EMAIL_PASS=(?!SUA_|YOUR_|\s*$|\$\{)[a-z0-9 ]{12,}\s*$/im,
];
const violations = [];
for (const path of new Set(files)) {
  if (path.startsWith('dump/') || path.endsWith('.bson')) {
    violations.push(`${path}: dump de dados versionado`);
    continue;
  }
  if (/^\.env(?:\.|$)/.test(basename(path)) && !path.endsWith('.example')) {
    violations.push(`${path}: arquivo privado de ambiente versionado`);
    continue;
  }
  if (statSync(path).size > 1_000_000 || path.endsWith('package-lock.json')) continue;
  const contents = readFileSync(path);
  if (contents.includes(0)) continue;
  const lines = contents.toString('utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    if (patterns.some(pattern => pattern.test(line))) violations.push(`${path}:${index + 1}: possível segredo`);
  }
}
if (violations.length) {
  console.error(violations.join('\n')); // Nunca imprime os valores encontrados.
  process.exitCode = 1;
} else {
  console.log('Verificação do checkout: nenhum segredo conhecido ou dump versionado encontrado.');
}

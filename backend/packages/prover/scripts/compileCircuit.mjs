import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../build');
const circuitPath = path.join(__dirname, '../circuits/sentinel_invariant_batch.circom');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

console.log('Compiling circuit (this may take a few seconds)...');

try {
  execSync(`circom ${circuitPath} --r1cs --wasm --sym -o ${buildDir} -l ${path.join(__dirname, '../node_modules')}`, { stdio: 'inherit' });
  console.log('✅ Circuit compiled successfully to packages/prover/build/');
} catch (error) {
  console.error('❌ Circuit compilation failed:', error);
  process.exit(1);
}

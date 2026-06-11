import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../build');
const zkeyFile = path.join(buildDir, 'sentinel_final.zkey');
const contractOut = path.join(__dirname, '../../contracts/src/verifiers/SentinelBatchVerifier.sol');

async function main() {
  if (!fs.existsSync(zkeyFile)) {
    console.error('❌ zkey file not found. Run pnpm trusted-setup first.');
    process.exit(1);
  }

  console.log('Exporting SentinelBatchVerifier.sol...');
  
  // Provide the path to the zkey, not the template. snarkjs handles the template internally
  // snarkjs.zKey.exportSolidityVerifier takes the zkey file and the solidity template map or file
  // Using the CLI is sometimes easier for exportSolidityVerifier as it has a nice wrapper, 
  // but snarkjs library exposes it too.
  
  // The easiest way is to use the CLI from child_process
  import('child_process').then(({ execSync }) => {
    try {
      execSync(`npx snarkjs zkey export solidityverifier ${zkeyFile} ${contractOut}`, { stdio: 'inherit' });
      console.log('✅ Verifier contract exported to:', contractOut);
    } catch (err) {
      console.error('❌ Failed to export verifier:', err);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error('❌ Export Verifier failed:', err);
  process.exit(1);
});

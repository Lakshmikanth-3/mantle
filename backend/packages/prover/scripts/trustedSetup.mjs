import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../build');
const r1csFile = path.join(buildDir, 'sentinel_invariant_batch.r1cs');
const ptauFile = path.join(buildDir, 'pot15_final.ptau');
const zkeyFile = path.join(buildDir, 'sentinel_final.zkey');
const vkeyFile = path.join(buildDir, 'verification_key.json');

async function main() {
  if (!fs.existsSync(r1csFile)) {
    console.error('❌ R1CS file not found. Run pnpm compile-circuit first.');
    process.exit(1);
  }

  console.log('Starting Trusted Setup...');
  
  try {
    console.log('1. Generating Powers of Tau (pot15_0000.ptau)...');
    execSync(`npx snarkjs powersoftau new bn128 15 ${path.join(buildDir, 'pot15_0000.ptau')} -v`, { stdio: 'inherit' });
    
    console.log('2. Contributing to Powers of Tau (pot15_0001.ptau)...');
    execSync(`npx snarkjs powersoftau contribute ${path.join(buildDir, 'pot15_0000.ptau')} ${path.join(buildDir, 'pot15_0001.ptau')} --name="Phase 1" -v -e="some random text"`, { stdio: 'inherit' });
    
    console.log('3. Preparing phase 2 (pot15_final.ptau)...');
    execSync(`npx snarkjs powersoftau prepare phase2 ${path.join(buildDir, 'pot15_0001.ptau')} ${ptauFile} -v`, { stdio: 'inherit' });
    
    console.log('4. Generating zkey (0000)...');
    execSync(`npx snarkjs groth16 setup ${r1csFile} ${ptauFile} ${path.join(buildDir, 'sentinel_0000.zkey')} -v`, { stdio: 'inherit' });
    
    console.log('5. Contributing to zkey (final)...');
    execSync(`npx snarkjs zkey contribute ${path.join(buildDir, 'sentinel_0000.zkey')} ${zkeyFile} --name="Phase 2" -v -e="some random text 2"`, { stdio: 'inherit' });
    
    console.log('6. Exporting verification key...');
    execSync(`npx snarkjs zkey export verificationkey ${zkeyFile} ${vkeyFile} -v`, { stdio: 'inherit' });

    console.log('✅ Trusted setup complete! Verification key saved to:', vkeyFile);
  } catch (err) {
    console.error('❌ Trusted Setup failed:', err.message);
    process.exit(1);
  }
}

main();

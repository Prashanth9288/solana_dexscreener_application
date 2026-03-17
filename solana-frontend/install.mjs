import { execSync } from 'child_process';
try {
  console.log('Starting npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('Finished install.');
} catch (e) {
  console.error(e.message);
}

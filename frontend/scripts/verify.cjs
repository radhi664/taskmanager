// Run existing CRA tools without loading .env files or embedding inherited
// REACT_APP_* values in verification artifacts. No dependencies are modified.
const path = require('path');
const mode = process.argv[2];
if (!['test', 'build'].includes(mode)) throw new Error('Use: node scripts/verify.cjs test|build [arguments]');
process.chdir(path.resolve(__dirname, '..'));
for (const key of Object.keys(process.env)) {
  if (/^REACT_APP_/i.test(key)) delete process.env[key];
}
process.env.REACT_APP_API_URL = 'http://localhost:5001/api';
process.env.CI = 'true';
const scripts = path.dirname(require.resolve('react-scripts/package.json'));
const dotenv = require(require.resolve('dotenv', { paths: [scripts] }));
dotenv.config = () => ({ parsed: {} });
const script = path.join(scripts, 'scripts', `${mode}.js`);
process.argv = [process.execPath, script, ...process.argv.slice(3)];
require(script);

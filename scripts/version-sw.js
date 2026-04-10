const fs = require('fs');
const crypto = require('crypto');

const hash = crypto.randomBytes(4).toString('hex');
const swPath = 'out/sw.js';

const sw = fs.readFileSync(swPath, 'utf8');
fs.writeFileSync(swPath, sw.replace('__BUILD_HASH__', hash));

console.log(`SW versioned: vibers-toolkit-${hash}`);

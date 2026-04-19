import fs from 'fs';

let content = fs.readFileSync('template-exporter-v3.mjs', 'utf8');

// Fix the window reference
content = content.replace(
  'is_external: !el.href.includes(urlObj.hostname || \'\')',
  'is_external: true'  // Simplify - assume external unless starts with #
);

// Also fix href check for local links
content = content.replace(
  "is_external: true",
  "is_external: el.href && !el.href.startsWith('#') && !el.href.startsWith('/') ? true : false"
);

fs.writeFileSync('template-exporter-v3.mjs', content);
console.log('Fixed V3');

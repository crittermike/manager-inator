const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`        .find(b => b.textContent?.includes('Edit'))`, `        .find(b => b.getAttribute('title') === 'Edit check-in')`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`    // Click Save
    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save'))`, `    // Click Save
    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save to repo'))`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

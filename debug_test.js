const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`    // Now it should be rendering InlinePrompt. Click Generate there.
    const startGenButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate'))`, `    // Now it should be rendering InlinePrompt. Click Generate there.
    const startGenButton = Array.from(container.querySelectorAll('button'))
      .filter(b => b.textContent?.includes('Generate')).pop() // The last one is likely the one inside the prompt`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

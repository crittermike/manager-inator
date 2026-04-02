const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

// Fix Test 1
content = content.replace(`    await act(async () => {
      startGenButton?.click()
    })

    // Give microtasks time to execute async dynamic import
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve()
        await vi.runAllTicks()
      }
    })`, `    // No startGenButton needed, it generates immediately on menu click
    // Give microtasks time to execute async dynamic import
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        await Promise.resolve()
        await vi.runAllTicks()
      }
    })`);

// Fix Test 2
content = content.replace(`        .find(b => b.getAttribute('title') === 'Edit check-in')`, `        .find(b => b.textContent?.trim() === 'Edit')`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

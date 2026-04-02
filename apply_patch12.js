const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`    await act(async () => {
      // wait for dynamic import and subsequent promises
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 0));
        await vi.runAllTimersAsync();
      }
    })`, `    await act(async () => {
      for (let i = 0; i < 50; i++) {
        await Promise.resolve();
        await vi.runAllTicks();
      }
    })`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

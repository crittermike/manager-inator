const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`    await act(async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve()
      }
    })`, `    await act(async () => {
      await vi.runAllTimersAsync()
    })`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

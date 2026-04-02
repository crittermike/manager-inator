const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`  beforeEach(() => {
    vi.useFakeTimers()
  })`, `  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })`);

content = content.replace(`    await act(async () => {
      for (let i = 0; i < 50; i++) {
        await Promise.resolve();
        await vi.runAllTicks();
      }
    })`, `    await act(async () => {
      await new Promise(r => setTimeout(r, 100))
    })`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`    await act(async () => {
      await vi.runAllTimersAsync()
    })`, `    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })`);

content = content.replace(`    // Auto-generate should have been called`, `    await act(async () => {
      await vi.runAllTimersAsync()
    })
    
    // Auto-generate should have been called`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

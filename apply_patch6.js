const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`    await act(async () => {
      root.unmount()
    })`, `    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })
    
    await act(async () => {
      root.unmount()
    })`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

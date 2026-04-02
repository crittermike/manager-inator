const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`const mockDate = new Date('2026-03-31T20:00:00Z')`, `const mockDate = new Date(2026, 2, 31, 12, 0, 0)
    console.log('Test Date:', mockDate, mockDate.getDate())`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

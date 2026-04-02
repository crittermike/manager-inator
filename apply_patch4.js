const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(/summaries: \[\]/g, `summaries: [],
          contextNotes: []`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

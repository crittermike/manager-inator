const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: []`, `          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: []`);

content = content.replace(`          checkIns: []
        }),`, `          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: []
        }),`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

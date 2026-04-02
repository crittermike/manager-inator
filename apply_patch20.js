const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`    // The commitFile should have been called with the March path`, `    console.log("TEST 1 HTML:", container.innerHTML);
    // The commitFile should have been called with the March path`);

content = content.replace(`      expect(editButton).toBeDefined()`, `      if (!editButton) console.log("TEST 2 HTML:", container.innerHTML);
      expect(editButton).toBeDefined()`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

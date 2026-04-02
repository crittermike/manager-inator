const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: []
        }),`, `getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: []
        }),`);
        
content = content.replace(`expect(container.textContent).toContain('Check-in with Alice')`, `expect(container.textContent).toContain('Monthly check-in due for Alice Smith')`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

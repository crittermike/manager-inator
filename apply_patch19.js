const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`      // Check-in should render, find Edit button
      const editButton = Array.from(container.querySelectorAll('button'))`, `      // Click the check-in row to expand it
      const rowButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Monthly check-in — 2026-02'))
        
      await act(async () => {
        rowButton?.click()
      })

      // Check-in should render, find Edit button
      const editButton = Array.from(container.querySelectorAll('button'))`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

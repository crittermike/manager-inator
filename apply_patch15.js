const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

// Fix button clicking
content = content.replace(`    // Find the Actions menu button
    const menuButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Actions'))
      
    await act(async () => {
      menuButton?.click()
    })

    const genButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate Check-in'))`, `    // Find the Generate menu button
    const menuButton = container.querySelector('button[aria-label="Generate"]')
      
    await act(async () => {
      menuButton?.click()
    })

    const genButton = Array.from(container.querySelectorAll('button[role="menuitem"]'))
      .find(b => b.textContent?.includes('Monthly performance check-in'))`);

// Fix mock check-in data
content = content.replace(`      date: '2026-02',
      content: 'Original check-in content',
      updatedAt: '2026-03-01T12:00:00Z'
    }]`, `      date: '2026-02',
      content: 'Original check-in content',
      updatedAt: '2026-03-01T12:00:00Z',
      accomplishments: [],
      concerns: []
    }]`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

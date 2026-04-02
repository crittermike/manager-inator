const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

// For the first test
content = content.replace(`    // Find the Generate Check-in button
    const genButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate Check-in'))

    expect(genButton).toBeDefined()

    await act(async () => {
      genButton?.click()
    })`, `    // Find the Actions menu button
    const menuButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Actions'))
      
    await act(async () => {
      menuButton?.click()
    })

    const genButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate Check-in'))

    expect(genButton).toBeDefined()

    await act(async () => {
      genButton?.click()
    })`);

// For the second test
content = content.replace(`    // Add a check-in to mock data
    const origReport = mockReport
    mockReport = {
      ...origReport,
      checkIns: [{
        date: '2026-02',
        content: 'Original check-in content'
      }]
    }`, `    // Add a check-in to mock data
    const origCheckIns = [...mockReport.checkIns]
    mockReport.checkIns = [{
      date: '2026-02',
      content: 'Original check-in content',
      updatedAt: '2026-03-01T12:00:00Z'
    }]`);

content = content.replace(`    } finally {
      mockReport = origReport
    }`, `    } finally {
      mockReport.checkIns = origCheckIns
    }`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

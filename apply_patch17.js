const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`    // Add a check-in to mock data
    const origCheckIns = [...mockReport.checkIns]`, `    mockUseFileContent.mockImplementation((path) => {
      if (path === 'reports/alice-smith/check-ins/monthly/2026-02.md') {
        return { content: 'Mock checkin content', loading: false }
      }
      return { content: null, loading: false }
    })
    
    // Add a check-in to mock data
    const origCheckIns = [...mockReport.checkIns]`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

content = content.replace(`    expect(window.api.getReportData).toHaveBeenCalledWith('alice-smith')
    expect(window.api.aiGenerate).toHaveBeenCalled()`, `    console.log("API aiGenerate:", typeof window.api.aiGenerate, "calls:", window.api.aiGenerate.mock?.calls?.length);
    expect(window.api.getReportData).toHaveBeenCalledWith('alice-smith')
    expect(window.api.aiGenerate).toHaveBeenCalled()`);

fs.writeFileSync('tests/renderer/Today.test.tsx', content);

const fs = require('fs');

let today = fs.readFileSync('src/renderer/pages/Today.tsx', 'utf8');

// The line is: "if (!isCheckInMonth) return; console.log("isCheckInMonth", isCheckInMonth, month);"
today = today.replace(/if \(!isCheckInMonth\) return; console\.log\("isCheckInMonth", isCheckInMonth, month\);/g, "if (!isCheckInMonth) return");

// "if (now.getDate() !== lastDayOfMonth) { console.log("not last day", now.getDate(), lastDayOfMonth); return; }"
today = today.replace(/if \(now\.getDate\(\) !== lastDayOfMonth\) \{ console\.log\("not last day", now\.getDate\(\), lastDayOfMonth\); return; \}/g, "if (now.getDate() !== lastDayOfMonth) return");

// "let generatedAny = false; console.log("running loop for", overview.reports.length);"
today = today.replace(/let generatedAny = false; console\.log\("running loop for", overview\.reports\.length\);/g, "let generatedAny = false");

// "console.log("checking report", r.name, r.lastCheckIn, monthStr); if (!r.lastCheckIn || r.lastCheckIn < monthStr) {"
today = today.replace(/console\.log\("checking report", r\.name, r\.lastCheckIn, monthStr\); if \(!r\.lastCheckIn \|\| r\.lastCheckIn < monthStr\) \{/g, "if (!r.lastCheckIn || r.lastCheckIn < monthStr) {");

// "console.log("calling getReportData"); const reportData"
today = today.replace(/console\.log\("calling getReportData"\); const reportData/g, "const reportData");

// "console.log("reportData:", Object.keys(reportData)); const { getCheckInContext }"
today = today.replace(/console\.log\("reportData:", Object\.keys\(reportData\)\); const \{ getCheckInContext \}/g, "const { getCheckInContext }");

// "console.log("context done"); let rid = "mock-uuid"; try { rid = crypto.randomUUID(); console.log("rid ok", rid); } catch(err){ console.log("uuid error", err); }"
today = today.replace(/console\.log\("context done"\); let rid = "mock-uuid"; try \{ rid = crypto\.randomUUID\(\); console\.log\("rid ok", rid\); \} catch\(err\)\{ console\.log\("uuid error", err\); \}/g, "const rid = crypto.randomUUID()");

fs.writeFileSync('src/renderer/pages/Today.tsx', today);

let test = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');
test = test.replace(/console\.log\('Test Date:', mockDate, mockDate\.getDate\(\)\)/g, "");
test = test.replace(/console\.log\("API aiGenerate:", typeof window\.api\.aiGenerate, "calls:", window\.api\.aiGenerate\.mock\?\.calls\?\.length\);/g, "");
fs.writeFileSync('tests/renderer/Today.test.tsx', test);


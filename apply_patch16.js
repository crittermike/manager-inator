const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

content = content.replace(`        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined)
      }
    })`, `        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
        getFileContent: vi.fn().mockResolvedValue('mock file content')
      }
    })`);

fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

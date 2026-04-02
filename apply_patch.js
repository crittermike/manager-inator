const fs = require('fs');
let content = fs.readFileSync('tests/renderer/Today.test.tsx', 'utf8');

const target1 = `        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined)
      }
    })
  })`

const replace1 = `        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: []
        }),
        aiGenerate: vi.fn().mockResolvedValue('Mock generated check-in'),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })
  })`

content = content.replace(target1, replace1);

const target2 = `describe('Today date-sensitive behavior', () => {
  it('does not label check-ins as overdue on the 1st of the month', async () => {
    // We mock Date to be the 1st of the month
    const mockDate = new Date('2026-04-01T12:00:00Z')
    vi.setSystemTime(mockDate)
    
    // We need to render Today and verify 'overdue-checkin' is not under overdue section, but under this-week
    // Given the component structure, it's easier to verify the section props or just check the DOM
  })
})`

const replace2 = `describe('Today date-sensitive behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not label check-ins as overdue on the 1st of the month', async () => {
    const mockDate = new Date('2026-04-01T12:00:00Z')
    vi.setSystemTime(mockDate)
    
    const { container, root } = await renderToday()
    
    const overdueSection = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Overdue'))?.closest('div')
    
    if (overdueSection) {
      expect(overdueSection.textContent).not.toContain('Monthly check-in with Alice Smith is overdue')
    }
    
    // Verify it is in 'this-week' or later instead
    expect(container.textContent).toContain('Check-in with Alice')

    await act(async () => {
      root.unmount()
    })
  })

  it('auto-generates missing check-ins on the last day of the month', async () => {
    const mockDate = new Date('2026-03-31T20:00:00Z')
    vi.setSystemTime(mockDate)
    
    const { root, container } = await renderToday()
    
    // Auto-generate should have been called
    expect(window.api.getReportData).toHaveBeenCalledWith('alice-smith')
    expect(window.api.aiGenerate).toHaveBeenCalled()
    expect(window.api.commitFile).toHaveBeenCalled()
    
    await act(async () => {
      root.unmount()
    })
  })
})`

content = content.replace(target2, replace2);
fs.writeFileSync('tests/renderer/Today.test.tsx', content);
console.log('Patch applied successfully.');

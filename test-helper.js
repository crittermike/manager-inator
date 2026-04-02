const fs = require('fs');
let content = fs.readFileSync('tests/renderer/ReportDetail.test.tsx', 'utf8');

const newTests = `
describe('ReportDetail monthly check-in workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('targets previous month if generated on the 1st of the month', async () => {
    const mockDate = new Date(2026, 3, 1, 12, 0, 0) // April 1, 2026
    vi.setSystemTime(mockDate)

    const { container, root } = await renderReportDetail()

    // Find the Generate Check-in button
    const genButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate Check-in'))

    expect(genButton).toBeDefined()

    await act(async () => {
      genButton?.click()
    })

    // Now it should be rendering InlinePrompt. Click Generate there.
    const startGenButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Generate'))
      
    await act(async () => {
      startGenButton?.click()
    })

    // Give microtasks time to execute async dynamic import
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve()
        await vi.runAllTicks()
      }
    })

    // Click Save
    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save'))
      
    await act(async () => {
      saveButton?.click()
    })

    // The commitFile should have been called with the March path
    expect(window.api.commitFile).toHaveBeenCalledWith(
      expect.stringContaining('reports/alice-smith/check-ins/monthly/2026-03.md'),
      expect.any(String),
      expect.any(String)
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('allows inline editing and saving of check-in details', async () => {
    // Add a check-in to mock data
    const origReport = mockReport
    mockReport = {
      ...origReport,
      checkIns: [{
        date: '2026-02',
        content: 'Original check-in content'
      }]
    }

    try {
      const { container, root } = await renderReportDetail()

      // Switch to Check-ins filter
      const filterBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Check-ins'))
        
      await act(async () => {
        filterBtn?.click()
      })

      // Check-in should render, find Edit button
      const editButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Edit'))
        
      expect(editButton).toBeDefined()

      await act(async () => {
        editButton?.click()
      })

      // Find save button after editing
      const saveButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent === 'Save')

      await act(async () => {
        saveButton?.click()
      })

      expect(window.api.commitFile).toHaveBeenCalledWith(
        'reports/alice-smith/check-ins/monthly/2026-02.md',
        expect.any(String),
        expect.any(String)
      )

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport = origReport
    }
  })
})
`

content = content + '\n' + newTests;
fs.writeFileSync('tests/renderer/ReportDetail.test.tsx', content);

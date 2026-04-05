// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { ComboInput } from '../../src/renderer/components/common/ComboInput'

const OPTIONS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']

function ControlledCombo(props: Partial<React.ComponentProps<typeof ComboInput>>) {
  const [value, setValue] = useState('')
  const finalValue = props.value ?? value
  const finalOnChange = props.onChange ?? setValue
  return (
    <ComboInput
      value={finalValue}
      onChange={finalOnChange}
      options={props.options ?? OPTIONS}
      placeholder={props.placeholder ?? 'Pick a fruit'}
      label={props.label}
    />
  )
}

function fireKey(element: HTMLElement, key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  element.dispatchEvent(event)
}

describe('ComboInput', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
  })

  it('renders input with combobox role', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
  })

  it('renders label when provided', async () => {
    await act(async () => {
      root.render(<ControlledCombo label="Fruit" />)
    })

    const label = container.querySelector('label')
    expect(label).not.toBeNull()
    expect(label!.textContent).toBe('Fruit')

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    expect(label!.getAttribute('for')).toBe(input.id)
  })

  it('shows dropdown on focus', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    expect(container.querySelector('[role="listbox"]')).toBeNull()

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBe(5)
  })

  it('navigates options with arrow keys', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    await act(async () => { fireKey(input, 'ArrowDown') })

    const options = container.querySelectorAll('[role="option"]')
    expect(options[0].className).toContain('bg-brand/20')
  })

  it('wraps around when navigating past the end', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    for (let i = 0; i <= OPTIONS.length; i++) {
      await act(async () => { fireKey(input, 'ArrowDown') })
    }

    const options = container.querySelectorAll('[role="option"]')
    expect(options[0].className).toContain('bg-brand/20')
  })

  it('selects option with Enter', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<ControlledCombo onChange={onChange} />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    await act(async () => { fireKey(input, 'ArrowDown') })
    await act(async () => { fireKey(input, 'Enter') })

    expect(onChange).toHaveBeenCalledWith('Apple')
  })

  it('closes dropdown on Escape', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })
    expect(container.querySelector('[role="listbox"]')).not.toBeNull()

    await act(async () => { fireKey(input, 'Escape') })

    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('closes dropdown on outside click', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })
    expect(container.querySelector('[role="listbox"]')).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('selects option on click', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<ControlledCombo onChange={onChange} />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    const options = container.querySelectorAll('[role="option"]')
    await act(async () => { (options[2] as HTMLElement).click() })

    expect(onChange).toHaveBeenCalledWith('Cherry')
  })

  it('sets aria-expanded based on dropdown state', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    expect(input.getAttribute('aria-expanded')).toBe('false')

    await act(async () => { input.focus() })

    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('sets aria-activedescendant when navigating', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    await act(async () => { fireKey(input, 'ArrowDown') })

    const activedescendant = input.getAttribute('aria-activedescendant')
    expect(activedescendant).not.toBeNull()

    const firstOption = container.querySelectorAll('[role="option"]')[0]
    expect(activedescendant).toBe(firstOption.id)
  })

  it('sets aria-selected on the currently selected option', async () => {
    await act(async () => {
      root.render(<ControlledCombo value="Cherry" onChange={() => {}} />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    const options = container.querySelectorAll('[role="option"]')
    const cherryOption = Array.from(options).find(o => o.textContent === 'Cherry')!
    expect(cherryOption.getAttribute('aria-selected')).toBe('true')
  })

  it('opens dropdown on ArrowDown when closed', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    expect(container.querySelector('[role="listbox"]')).toBeNull()

    await act(async () => { fireKey(input, 'ArrowDown') })

    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('renders placeholder text', async () => {
    await act(async () => {
      root.render(<ControlledCombo placeholder="Choose..." />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    expect(input.getAttribute('placeholder')).toBe('Choose...')
  })

  it('navigates up with ArrowUp', async () => {
    await act(async () => {
      root.render(<ControlledCombo />)
    })

    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => { input.focus() })

    await act(async () => { fireKey(input, 'ArrowDown') })
    await act(async () => { fireKey(input, 'ArrowDown') })
    await act(async () => { fireKey(input, 'ArrowUp') })

    const options = container.querySelectorAll('[role="option"]')
    expect(options[0].className).toContain('bg-brand/20')
  })
})

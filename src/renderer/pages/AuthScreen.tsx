import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Zap, Github, Copy, Check, ExternalLink } from 'lucide-react'

export function AuthScreen() {
  const { login, poll } = useAuth()
  const [step, setStep] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [userCode, setUserCode] = useState('')
  const [copied, setCopied] = useState(false)

  const handleLogin = async () => {
    try {
      setStep('waiting')
      const { userCode } = await login()
      setUserCode(userCode)

      // Poll for completion
      const interval = setInterval(async () => {
        const success = await poll()
        if (success) {
          clearInterval(interval)
          window.location.reload()
        }
      }, 5000)

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(interval)
        setStep('error')
      }, 600000)
    } catch {
      setStep('error')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
      <div className="drag-region absolute top-0 left-0 right-0 h-12" />

      <div className="w-full max-w-md px-8 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Manager-inator</h1>
          <p className="text-sm text-zinc-500 mt-1">
            AI-powered performance management
          </p>
        </div>

        {step === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 text-center">
              Connect your GitHub account to get started. Manager-inator uses
              your GitHub repo as the source of truth for all performance data.
            </p>
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-100 text-zinc-900 rounded-xl font-medium text-sm hover:bg-zinc-200 transition-colors no-drag"
            >
              <Github className="w-4 h-4" />
              Connect with GitHub
            </button>
          </div>
        )}

        {step === 'waiting' && (
          <div className="space-y-6">
            <p className="text-sm text-zinc-400 text-center">
              Enter this code on GitHub to authorize:
            </p>
            <div className="flex items-center justify-center gap-3">
              <code className="text-3xl font-mono font-bold text-brand-light tracking-[0.3em] bg-surface-raised px-6 py-3 rounded-xl">
                {userCode}
              </code>
              <button
                onClick={copyCode}
                className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors no-drag"
                title="Copy code"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-success" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
            <a
              href="https://github.com/login/device"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-brand-light hover:text-brand no-drag"
            >
              <ExternalLink className="w-4 h-4" />
              Open github.com/login/device
            </a>
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
              <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              Waiting for authorization...
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <p className="text-sm text-danger text-center">
              Authentication failed or timed out. Please try again.
            </p>
            <button
              onClick={() => setStep('idle')}
              className="w-full px-4 py-3 bg-surface-raised text-zinc-200 rounded-xl font-medium text-sm hover:bg-surface-overlay transition-colors no-drag"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

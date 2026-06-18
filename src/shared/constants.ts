/** Path to the manager's impact log file within the data repo */
export const IMPACT_LOG_PATH = 'impact-log.md'

/**
 * Default relationship categories for the Network of People feature.
 * Used as fallback options when settings.md does not define a `## Relationships` list.
 * Direct reports are auto-labelled "Direct Report" by `listPeople()` — that label is
 * intentionally omitted here so it never appears as a manual choice.
 */
export const RELATIONSHIP_CATEGORIES = [
  'Peer Manager',
  'Skip-Level',
  'Cross-functional Partner',
  'Stakeholder',
  'Mentor',
  'Mentee',
  'External',
] as const

export type RelationshipCategory = typeof RELATIONSHIP_CATEGORIES[number]

/** Auto-applied to merged direct-report entries. Never shown as a manual option. */
export const DIRECT_REPORT_RELATIONSHIP = 'Direct Report'

/** Default AI model ID */
export const DEFAULT_MODEL = 'claude-opus-4.7'

/** Available AI models for the model picker */
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4.7', name: 'Claude Opus 4.7', provider: 'Anthropic' },
  { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic' },
  { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI' },
  { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'OpenAI' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'OpenAI' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'o3', name: 'o3', provider: 'OpenAI' },
  { id: 'o4-mini', name: 'o4-mini', provider: 'OpenAI' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'Google' },
] as const

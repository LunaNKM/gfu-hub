import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return openaiClient
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini'

// 도구 선택 전용 모델 — 단순 판단이므로 nano로 충분 (TTFT 0.6초 vs mini 7.5초)
export const TOOL_DECISION_MODEL = process.env.TOOL_DECISION_MODEL || 'gpt-4.1-nano'

export default getOpenAIClient

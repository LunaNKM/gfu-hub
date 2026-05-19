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

export default getOpenAIClient

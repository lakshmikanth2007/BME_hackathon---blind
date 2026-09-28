/**
 * Environment access. Expo inlines EXPO_PUBLIC_* vars at build time.
 * Nothing here throws — missing keys degrade to "offline" behaviour so the
 * on-device features (Reader, Obstacle) keep working without a network.
 */

export type VlmProvider = 'claude' | 'gemini' | 'groq';

export interface EnvConfig {
  vlmProvider: VlmProvider;
  vlmApiKey: string;
  vlmModel: string;
  porcupineKey: string;
}

const DEFAULT_MODEL: Record<VlmProvider, string> = {
  gemini: 'gemini-3.8-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  claude: 'claude-sonnet-5',
};

function readEnv(): EnvConfig {
  const raw = (process.env.EXPO_PUBLIC_VLM_PROVIDER ?? 'claude').toLowerCase();
  const provider: VlmProvider =
    raw === 'gemini' ? 'gemini' : raw === 'groq' ? 'groq' : 'claude';
  return {
    vlmProvider: provider,
    vlmApiKey: process.env.EXPO_PUBLIC_VLM_API_KEY ?? '',
    vlmModel: process.env.EXPO_PUBLIC_VLM_MODEL ?? DEFAULT_MODEL[provider],
    porcupineKey: process.env.EXPO_PUBLIC_PORCUPINE_ACCESS_KEY ?? '',
  };
}

export const env = readEnv();

/** True if we have credentials to talk to a vision-language model. */
export function hasVlmKey(): boolean {
  return env.vlmApiKey.trim().length > 0;
}

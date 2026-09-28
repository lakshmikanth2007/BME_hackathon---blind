/**
 * Environment access. Expo inlines EXPO_PUBLIC_* vars at build time.
 * Nothing here throws — missing keys degrade to "offline" behaviour so the
 * on-device features (Reader, Obstacle) keep working without a network.
 */

export type VlmProvider = 'claude' | 'gemini';

export interface EnvConfig {
  vlmProvider: VlmProvider;
  vlmApiKey: string;
  vlmModel: string;
  porcupineKey: string;
}

function readEnv(): EnvConfig {
  const provider = (process.env.EXPO_PUBLIC_VLM_PROVIDER ?? 'claude') as VlmProvider;
  return {
    vlmProvider: provider === 'gemini' ? 'gemini' : 'claude',
    vlmApiKey: process.env.EXPO_PUBLIC_VLM_API_KEY ?? '',
    vlmModel:
      process.env.EXPO_PUBLIC_VLM_MODEL ??
      (provider === 'gemini' ? 'gemini-3.8-flash' : 'claude-sonnet-5'),
    porcupineKey: process.env.EXPO_PUBLIC_PORCUPINE_ACCESS_KEY ?? '',
  };
}

export const env = readEnv();

/** True if we have credentials to talk to a vision-language model. */
export function hasVlmKey(): boolean {
  return env.vlmApiKey.trim().length > 0;
}

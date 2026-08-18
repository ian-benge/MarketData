import { isSecretKey } from "./util";

export type RedactedConfig = {
  demoMode: string | undefined;
  nodeEnv: string | undefined;
  appUrl: string | undefined;
  allowMockProviders: string | undefined;
  secretKeysPresent: string[];
};

export function snapshotRedactedConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedactedConfig {
  const secretKeysPresent: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value || !isSecretKey(key)) continue;
    secretKeysPresent.push(key);
  }
  return {
    demoMode: env.DEMO_MODE,
    nodeEnv: env.NODE_ENV,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    allowMockProviders: env.ALLOW_MOCK_PROVIDERS,
    secretKeysPresent: secretKeysPresent.sort(),
  };
}

export function environmentFingerprint(env: NodeJS.ProcessEnv = process.env): {
  demoMode: boolean;
  nodeEnv: string;
  allowMockProviders: boolean;
} {
  return {
    demoMode: env.DEMO_MODE === "true" || env.DEMO_MODE === "1",
    nodeEnv: env.NODE_ENV ?? "development",
    allowMockProviders:
      env.ALLOW_MOCK_PROVIDERS === "true" || env.ALLOW_MOCK_PROVIDERS === "1",
  };
}

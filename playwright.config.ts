import { defineConfig } from '@playwright/test';
import { ACTION_MS, enabled } from './tests/pace';

// PW_SHOW_ACTIONS=1 attiva le decorazioni delle azioni (cursore, punto di click,
// riquadro sull'elemento, titolo dell'azione) e registra il video.
// Senza la variabile i test girano "puliti", come in CI.
const showActions = enabled;

const actionDecorations = {
  duration: ACTION_MS,
  // In basso: in alto il titolo coprirebbe header e menu dell'app.
  position: 'bottom-right' as const,
  cursor: 'pointer' as const,
  style: {
    point:
      'width: 28px; height: 28px; border-radius: 50%;' +
      'background: rgba(255, 40, 40, .45); box-shadow: 0 0 0 3px rgba(255, 40, 40, .9)',
    highlight: 'outline: 3px solid #ff00c8; background: rgba(255, 0, 200, .10)',
    title: 'font-size: 18px; background: #1c2430; color: #fff; padding: 6px 10px; border-radius: 6px',
  },
};

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  reporter: [['list']],
  // Con le pause della modalità "da guardare" un test dura molto più dei 30 s
  // predefiniti: lì il limite per test viene allargato.
  timeout: showActions ? 10 * 60_000 : 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4200',
    viewport: { width: 1000, height: 700 },
    video: showActions
      ? {
          mode: 'on',
          size: { width: 1000, height: 700 },
          show: {
            actions: actionDecorations,
            test: { level: 'step', position: 'bottom-left' },
          },
        }
      : 'off',
  },
  webServer: {
    command: 'npx ng serve --host 127.0.0.1 --port 4200',
    cwd: './demo-angular',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NG_CLI_ANALYTICS: 'false' },
  },
});

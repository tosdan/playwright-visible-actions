# Portare la strategia nel proprio progetto

I primi quattro passi riguardano solo il codice dei test e valgono per qualunque applicazione web. Il quinto è specifico per Angular ed è opzionale. Per capire cosa fa ogni pezzo c'è [come-funziona.md](come-funziona.md).

Questa guida descrive ciò che è stato fatto nella demo. Non è stata ancora seguita su un'applicazione reale: i punti segnati come "non verificato" vanno provati.

## Requisiti

- Playwright Test 1.64 o successivo (la demo usa la 1.65.1).
- Per il passo 5: Angular con componenti standalone e `Router.currentNavigation`, disponibile da Angular 20 (la demo usa la 22).

## 1. Copiare i due file dei test

Nella cartella dei test del progetto:

- [tests/pace.ts](../tests/pace.ts): i tempi della modalità "da guardare";
- [tests/fixtures.ts](../tests/fixtures.ts): banner, avvisi e attesa delle azioni.

Non hanno dipendenze oltre a `@playwright/test`.

## 2. Configurare Playwright

In `playwright.config.ts`, prendendo a modello [quello della demo](../playwright.config.ts):

```ts
import { ACTION_MS, enabled } from './tests/pace';

export default defineConfig({
  // Un test rallentato dura molto più dei 30 s predefiniti.
  timeout: enabled ? 10 * 60_000 : 30_000,
  use: {
    video: enabled
      ? {
          mode: 'on',
          show: {
            actions: {
              duration: ACTION_MS,
              position: 'bottom-right',
              cursor: 'pointer',
              style: {
                point: 'width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 40, 40, .45)',
                highlight: 'outline: 3px solid #ff00c8',
              },
            },
            test: { level: 'step', position: 'bottom-left' },
          },
        }
      : 'off',
  },
});
```

Se il progetto registra già i video con un'altra impostazione (per esempio `retain-on-failure`), va mantenuta quella nel ramo in cui `enabled` è falso.

## 3. Importare `test` ed `expect` dalla fixture

In ogni file di test:

```ts
// prima
import { test, expect } from '@playwright/test';

// dopo
import { test, expect } from './fixtures';
```

Se il progetto ha già una propria fixture che estende `test`, conviene estendere quella invece di `base` dentro `fixtures.ts`.

## 4. Aggiungere gli script

La variabile d'ambiente va impostata in modo che funzioni anche su Windows, per esempio con `cross-env`:

```bash
npm install -D cross-env
```

```json
{
  "scripts": {
    "test": "playwright test",
    "test:show": "cross-env PW_SHOW_ACTIONS=1 playwright test --headed",
    "test:video": "cross-env PW_SHOW_ACTIONS=1 playwright test"
  }
}
```

A questo punto funzionano già decorazioni delle azioni, banner per le navigazioni dirette e avvisi basati sull'URL. L'applicazione non è stata toccata.

## 5. Opzionale, solo Angular: il ponte sul Router

Serve per sapere quale guard è intervenuta e per vedere navigazioni bloccate, ignorate o senza cambio di URL.

1. Copiare [router-debug.ts](../demo-angular/src/app/router-debug.ts) accanto a `app.config.ts`.
2. Registrarlo tra i provider, dietro `ngDevMode`:

```ts
import { provideRouterDebugBridge } from './router-debug';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    ...(typeof ngDevMode === 'undefined' || ngDevMode ? [provideRouterDebugBridge()] : []),
  ],
};
```

La condizione va scritta esattamente così, nella stessa espressione che crea il provider: è ciò che permette al bundler di eliminare il ponte in produzione.

Varianti non verificate:

- **Applicazioni basate su `NgModule`**: il provider restituito da `provideRouterDebugBridge()` dovrebbe poter essere aggiunto ai `providers` di `AppModule` con la stessa condizione.
- **Angular precedente alla 20**: `router.currentNavigation()` non esiste; al suo posto va usato `router.getCurrentNavigation()`.

## 6. Proteggere il pacchetto di deploy

Se si è fatto il passo 5, copiare [scripts/check-prod-bundle.mjs](../scripts/check-prod-bundle.mjs) e farlo girare in CI:

```bash
node scripts/check-prod-bundle.mjs percorso/della/app
```

Lo script esegue `ng build --configuration production` nella cartella indicata e fallisce se nel bundle trova `__pwdbgRouter`. Se il progetto usa un comando di build diverso, va adattata la riga che lo lancia.

In questo repository il controllo gira nel workflow [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Regolare il comportamento

| Cosa | Dove |
|---|---|
| Ritmo complessivo | variabile `PW_SHOW_PACE` (1 = predefinito, 1.5 = più lento) |
| Singoli tempi | `tests/pace.ts` |
| Aspetto di cursore, punto, riquadro, titolo | `style` in `playwright.config.ts` |
| Aspetto e testi di banner e avvisi | funzioni `box`, `directBanner`, `toastBox` in `tests/fixtures.ts` |
| Soglia oltre cui una navigazione è "spontanea" | `RECENT_ACTION_MS` in `tests/fixtures.ts` |
| Azioni che attendono l'avviso | `GATED_ACTIONS` in `tests/fixtures.ts` |

## Problemi tipici

- **Il titolo dell'azione copre un elemento dell'app.** Cambiare `position` nella configurazione: ogni posizione copre qualcosa, va scelta quella meno occupata dall'interfaccia.
- **Gli screenshot di confronto (`toHaveScreenshot`) possono fallire in modalità "da guardare".** Le decorazioni sono disegnate nella pagina e compaiono negli screenshot. I confronti visivi vanno eseguiti in modalità normale.
- **Un test fallisce per timeout solo in modalità "da guardare".** Le pause allungano i tempi: controllare il `timeout` del passo 2 ed eventuali timeout impostati nei singoli test.
- **Gli avvisi non riportano le guard.** Il ponte non è registrato, oppure l'app è servita da una build di produzione.

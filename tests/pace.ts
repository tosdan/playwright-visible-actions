// Ritmo della modalità "da guardare" (PW_SHOW_ACTIONS=1), condiviso tra
// playwright.config.ts e tests/fixtures.ts.
//
// PW_SHOW_PACE moltiplica tutte le pause: 1 è il ritmo predefinito,
// 1.5 è più lento, 0.5 più veloce.
export const enabled = !!process.env.PW_SHOW_ACTIONS;

const requested = Number(process.env.PW_SHOW_PACE);
const pace = requested > 0 ? requested : 1;
const scaled = (ms: number) => Math.round(ms * pace);

/** Quanto resta visibile ogni azione (cursore, riquadro, titolo) prima della successiva. */
export const ACTION_MS = scaled(1500);
/** Pausa col banner arancione prima di una navigazione diretta del test. */
export const DIRECT_PAUSE_MS = scaled(1500);
/** Tempo di lettura di un avviso di navigazione dell'app: le azioni successive lo attendono. */
export const TOAST_MS = scaled(3000);

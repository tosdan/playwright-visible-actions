import { test as base, expect, type Frame, type Page, type Request } from '@playwright/test';
import { DIRECT_PAUSE_MS, TOAST_MS, enabled } from './pace';

// Le decorazioni native di Playwright (vedi playwright.config.ts) coprono click,
// fill, select, ecc. ma NON i cambi di pagina. Questa fixture li rende visibili
// tutti, distinguendo chi li ha causati:
//
//  - NAVIGAZIONE DIRETTA: il test ha chiamato page.goto/reload/goBack/goForward.
//    Banner arancione al centro, mostrato PRIMA di navigare.
//  - NAVIGAZIONE DELL'APP: l'URL è cambiato senza che il test navigasse
//    (routerLink, router.navigate, guard, timer, window.location…).
//    Avviso blu in alto, con l'ultima azione del test e quanto tempo prima.
//
// Se l'app Angular registra il ponte di sviluppo (router-debug.ts), gli avvisi
// usano anche gli eventi del Router: guard e resolver coinvolti, redirect,
// navigazioni bloccate o ignorate e cambi di vista senza cambio di URL.
// Senza il ponte la fixture funziona lo stesso, basandosi solo sull'URL.
//
// Tutto è attivo solo con PW_SHOW_ACTIONS=1; i tempi sono in tests/pace.ts.
const PAUSE_MS = DIRECT_PAUSE_MS;
const RECENT_ACTION_MS = 5000; // oltre questo tempo l'ultima azione non è più "recente"

// Azioni che attendono la fine della lettura dell'avviso in corso: senza
// questa attesa il test proseguirebbe mentre l'avviso è ancora a schermo e chi
// guarda dovrebbe seguire due cose insieme.
const GATED_ACTIONS = [
  'click', 'dblclick', 'tap', 'hover', 'fill', 'clear', 'type', 'press', 'pressSequentially',
  'check', 'uncheck', 'setChecked', 'selectOption', 'setInputFiles', 'dragTo',
] as const;

const gates = new WeakMap<Page, () => Promise<void>>();
let locatorsGated = false;

function gateActions(page: Page, gate: () => Promise<void>) {
  gates.set(page, gate);
  const wrap = (target: any, pageOf: (self: any) => Page) => {
    for (const name of GATED_ACTIONS) {
      const original = target[name];
      if (typeof original !== 'function') continue;
      target[name] = async function (this: any, ...args: unknown[]) {
        await gates.get(pageOf(this))?.();
        return original.apply(this, args);
      };
    }
  };
  wrap(page, (self) => self); // page.click(selector), page.fill(selector, …)
  if (!locatorsGated) {
    locatorsGated = true;
    // Tutti i Locator condividono lo stesso prototipo: basta decorarlo una volta.
    wrap(Object.getPrototypeOf(page.locator('html')), (self) => self.page());
  }
}

const BLUE = '#1d4ed8';
const RED = '#b91c1c';
const GREY = '#475569';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const box = (css: string, title: string, main: string, details: string[]) => `
  <div style="position: fixed; left: 50%; ${css} max-width: 80vw; padding: 12px 20px;
              border-radius: 10px; color: #fff; font: 600 18px system-ui, sans-serif;
              box-shadow: 0 6px 24px rgba(0, 0, 0, .35); text-align: center;">
    <div style="font-size: 12px; opacity: .85; letter-spacing: .06em;">${escapeHtml(title)}</div>
    <div style="margin-top: 4px; word-break: break-all;">${escapeHtml(main)}</div>
    ${details.map((l) => `<div style="margin-top: 4px; font: 400 14px system-ui, sans-serif;">${escapeHtml(l)}</div>`).join('')}
  </div>`;

const directBanner = (text: string) =>
  box('top: 50%; transform: translate(-50%, -50%); background: #b45309;', 'NAVIGAZIONE DIRETTA DEL TEST (nessun click)', text, []);

const toastBox = (color: string, title: string, main: string, details: string[]) =>
  box(`top: 64px; transform: translateX(-50%); background: ${color};`, title, main, details);

/**
 * Eseguito DENTRO la pagina (init script): segnala al test ogni input ricevuto,
 * così a un cambio di URL si può dire quale azione lo ha preceduto.
 */
function trackInputs() {
  const describe = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return 'pagina';
    const el = target.closest('a, button, input, select, textarea, label, [role], [routerLink]') ?? target;
    const field = el as HTMLInputElement;
    const name =
      el.getAttribute('aria-label') ||
      field.labels?.[0]?.innerText ||
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
        ? field.placeholder || field.name
        : (el as HTMLElement).innerText) ||
      el.id ||
      '';
    const short = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${short ? `«${short}» ` : ''}<${el.tagName.toLowerCase()}>`;
  };
  const report = (kind: string) => (event: Event) => {
    try {
      (window as any).__pwdbgInput(`${kind} ${describe(event.target)}`);
    } catch {
      // binding non ancora disponibile: si ignora
    }
  };
  // Niente 'change': su un campo di testo scatta alla perdita del focus, cioè
  // DOPO il pointerdown del click successivo, e ne ruberebbe la paternità.
  addEventListener('pointerdown', report('click su'), true);
  addEventListener('keydown', (e) => report(`tasto ${(e as KeyboardEvent).key} su`)(e), true);
  addEventListener('input', report('valore modificato in'), true);
}

// Eventi inviati dal ponte dell'app (demo-angular/src/app/router-debug.ts).
type RouterEvent =
  | { type: 'start'; id: number; url: string; trigger?: string; skipLocationChange: boolean }
  | { type: 'recognized'; id: number; urlAfterRedirects: string; guards: string[]; resolvers: string[] }
  | { type: 'phase'; id: number; phase: 'guard' | 'guard-ok' | 'resolver' }
  | { type: 'end'; id: number; url: string; urlAfterRedirects: string }
  | { type: 'cancel'; id: number; url: string; code: string; reason: string }
  | { type: 'error'; id: number; url: string; message: string }
  | { type: 'skipped'; id: number; url: string; code: string; reason: string };

type UrlChange = { from: string; to: string; at: number };

type RouterNavigation = {
  url: string;
  trigger?: string;
  skipLocationChange: boolean;
  guards: string[];
  resolvers: string[];
  phase?: 'guard' | 'guard-ok' | 'resolver';
  urlChange?: UrlChange;
};

type Announcer = { settle(): Promise<void> };

async function announceNavigations(page: Page, baseURL: string | undefined): Promise<Announcer> {
  let lastInput: { description: string; at: number } | undefined;
  let currentUrl = page.url();
  // Navigazione diretta in corso: il primo cambio di URL verso la destinazione
  // attesa è "del test"; qualunque altro cambio è un redirect dell'app.
  let direct: { label: string; expectedUrl?: string; consumed: boolean } | undefined;
  let toast: { dispose(): Promise<void> } | undefined;
  let toastUntil = 0;
  let toastQueue: Promise<void> = Promise.resolve();
  // Richiesta di un nuovo documento in corso sul frame principale: distingue un
  // reload completo da un cambio di rotta fatto dal router (History API).
  let documentRequest: Request | undefined;

  // Stato ricavato dagli eventi del Router (vuoto se l'app non ha il ponte).
  const routerNavigations = new Map<number, RouterNavigation>();
  const story: string[] = []; // navigazioni annullate che hanno portato a quella in corso
  let unclaimedChange: UrlChange | undefined; // cambio URL già annunciato senza dettagli del Router
  let lastReload: UrlChange | undefined;

  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequest = request;
  });
  page.on('requestfailed', (request) => {
    if (request === documentRequest) documentRequest = undefined;
  });

  const display = (url: string) => {
    try {
      const u = new URL(url);
      const sameOrigin = baseURL ? u.origin === new URL(baseURL).origin : true;
      return sameOrigin ? u.pathname + u.search + u.hash : url;
    } catch {
      return url;
    }
  };

  const describeCause = (routerKnows = false) => {
    if (direct) return routerKnows ? `durante ${direct.label} del test` : `redirect durante ${direct.label} (guard, redirectTo o server)`;
    const elapsed = lastInput ? Date.now() - lastInput.at : Infinity;
    if (!lastInput || elapsed > RECENT_ACTION_MS)
      return 'spontanea: nessuna azione recente del test (timer, redirect…)';
    return `dopo: ${lastInput.description} · ${(elapsed / 1000).toFixed(1).replace('.', ',')} s prima`;
  };

  // In coda: due navigazioni ravvicinate non devono lasciare avvisi orfani.
  // La scadenza è gestita qui con un timer: showOverlay con `duration` si
  // risolve solo a overlay rimosso e ritarderebbe tutti gli avvisi successivi.
  const showToast = (html: string) => {
    toastUntil = Date.now() + TOAST_MS;
    toastQueue = toastQueue.then(async () => {
      try {
        const previous = toast;
        toast = undefined;
        await previous?.dispose();
        const current = await page.screencast.showOverlay(html);
        toast = current;
        setTimeout(() => {
          if (toast !== current) return;
          toast = undefined;
          current.dispose().catch(() => {});
        }, TOAST_MS);
      } catch {
        // pagina chiusa nel frattempo
      }
    });
  };

  // Attende che l'avviso corrente abbia esaurito il suo tempo di lettura.
  const settle = async () => {
    await toastQueue;
    const remaining = toastUntil - Date.now();
    if (remaining > 0) await sleep(remaining + 50);
  };

  const onRouterEvent = (event: RouterEvent) => {
    if (event.type === 'start') {
      routerNavigations.set(event.id, { ...event, guards: [], resolvers: [] });
      return;
    }
    if (event.type === 'skipped') {
      // Emesso al posto di NavigationStart: il Router non ha fatto nulla.
      const why = event.code === 'IgnoredSameUrlNavigation' ? 'la rotta richiesta è già quella attiva' : event.reason;
      showToast(toastBox(GREY, 'NAVIGAZIONE IGNORATA DAL ROUTER', `${event.url} · nessun effetto`, [describeCause(true), `Router: ${why}`]));
      return;
    }
    const nav = routerNavigations.get(event.id);
    if (!nav) return;
    if (event.type === 'recognized') {
      nav.guards = event.guards;
      nav.resolvers = event.resolvers;
      return;
    }
    if (event.type === 'phase') {
      nav.phase = event.phase;
      return;
    }
    routerNavigations.delete(event.id);
    // Il reload "appartiene" solo alla prima navigazione del Router che lo segue.
    const reload = lastReload;
    lastReload = undefined;

    const stage =
      nav.phase === 'guard' && nav.guards.length
        ? nav.guards.length === 1
          ? ` dalla guard ${nav.guards[0]}`
          : ` da una guard (tra: ${nav.guards.join(', ')})`
        : nav.phase === 'resolver'
          ? ` da un resolver (${nav.resolvers.join(', ')})`
          : '';

    // Annullamenti che non chiudono la storia: segue un'altra navigazione.
    if (event.type === 'cancel' && event.code === 'Redirect') {
      story.push(`richiesta ${nav.url}: reindirizzata${stage}`);
      lastReload = reload;
      return;
    }
    if (event.type === 'cancel' && event.code === 'SupersededByNewNavigation') {
      story.push(`richiesta ${nav.url}: sostituita da una nuova navigazione`);
      lastReload = reload;
      return;
    }

    const notes = story.splice(0);
    const routerLines = () => notes.map((note) => `Router: ${note}`);

    if (event.type === 'error') {
      notes.push(event.message);
      showToast(toastBox(RED, 'ERRORE DI NAVIGAZIONE', `${nav.url} · URL invariato`, [describeCause(true), ...routerLines()]));
      return;
    }
    if (event.type === 'cancel') {
      const why: Record<string, string> = {
        GuardRejected: `rifiutata${stage || ' da una guard'}`,
        NoDataFromResolver: `annullata: un resolver non ha restituito dati${stage}`,
        Aborted: 'annullata',
      };
      notes.push(why[event.code] ?? `annullata (${event.code})`);
      showToast(toastBox(RED, 'NAVIGAZIONE BLOCCATA DAL ROUTER', `${nav.url} · URL invariato`, [describeCause(true), ...routerLines()]));
      return;
    }

    // NavigationEnd
    let change = nav.urlChange;
    if (!change && unclaimedChange && Date.now() - unclaimedChange.at < 1000) change = unclaimedChange;
    unclaimedChange = undefined;
    const redirected = event.urlAfterRedirects !== event.url;
    // Niente da segnalare: tipicamente la navigazione iniziale dopo un caricamento.
    if (!change && !redirected && !nav.skipLocationChange && !notes.length) return;

    if (redirected) notes.push(`redirectTo: ${event.url} → ${event.urlAfterRedirects}`);
    if (nav.guards.length) notes.push(`guard superate: ${nav.guards.join(', ')}`);
    if (nav.resolvers.length) notes.push(`resolver eseguiti: ${nav.resolvers.join(', ')}`);
    if (nav.trigger === 'popstate') notes.push('origine: cronologia del browser (indietro/avanti)');

    let kind = 'cambio rotta senza reload';
    let route: string;
    if (change) {
      let from = change.from;
      // Prima navigazione del Router dopo un reload avviato dall'app: è un'unica storia.
      if (reload && reload.to === change.from) {
        from = reload.from;
        kind = 'reload completo, poi redirect del Router';
      }
      route = `${display(from)} → ${display(change.to)}`;
    } else if (nav.skipLocationChange) {
      kind = 'cambio vista SENZA cambio di URL (skipLocationChange)';
      route = `vista ${event.urlAfterRedirects} · URL fermo a ${display(currentUrl)}`;
    } else {
      route = `${event.url} → ${event.urlAfterRedirects}`;
    }
    showToast(toastBox(BLUE, `NAVIGAZIONE DELL'APP · ${kind}`, route, [describeCause(true), ...routerLines()]));
  };

  await page.exposeFunction('__pwdbgInput', (description: string) => {
    lastInput = { description, at: Date.now() };
  });
  await page.exposeFunction('__pwdbgRouter', onRouterEvent);
  await page.addInitScript(trackInputs);

  page.on('framenavigated', (frame: Frame) => {
    if (frame !== page.mainFrame()) return;
    const from = currentUrl;
    const to = frame.url();
    const fullReload = !!documentRequest;
    documentRequest = undefined;
    currentUrl = to;
    if (fullReload) {
      // Nuovo documento: il Router riparte da zero.
      routerNavigations.clear();
      story.length = 0;
    }
    if (to === 'about:blank') return;
    if (direct && !direct.consumed && (!direct.expectedUrl || direct.expectedUrl === to)) {
      direct.consumed = true; // è la navigazione chiesta dal test, già annunciata dal banner
      return;
    }
    // Stesso URL senza nuovo documento: è solo un replaceState (Angular lo fa a
    // ogni avvio per salvare il proprio stato), non una navigazione.
    if (from === to && !fullReload) return;

    const change: UrlChange = { from, to, at: Date.now() };
    if (fullReload) {
      lastReload = change;
    } else {
      // Navigazione del Router in corso: l'avviso arriva alla sua conclusione,
      // completo dei dettagli (guard, redirect…).
      const active = [...routerNavigations.values()].at(-1);
      if (active) {
        active.urlChange = change;
        return;
      }
      unclaimedChange = change;
    }
    const kind = fullReload ? 'reload completo della pagina' : 'cambio rotta senza reload';
    const route = from === to ? `ricaricata ${display(to)}` : `${display(from)} → ${display(to)}`;
    showToast(toastBox(BLUE, `NAVIGAZIONE DELL'APP · ${kind}`, route, [describeCause()]));
  });

  const labels = {
    goto: (url: unknown) => `goto → ${url}`,
    reload: () => 'reload della pagina',
    goBack: () => 'indietro nella cronologia',
    goForward: () => 'avanti nella cronologia',
  } as const;

  for (const name of Object.keys(labels) as (keyof typeof labels)[]) {
    const original = (page[name] as (...args: unknown[]) => Promise<unknown>).bind(page);
    (page as any)[name] = async (...args: unknown[]) => {
      const label = labels[name](args[0]);
      let expectedUrl: string | undefined;
      if (name === 'goto') expectedUrl = new URL(String(args[0]), baseURL).href;
      if (name === 'reload') expectedUrl = page.url();
      // Un avviso ancora visibile parla della pagina che si sta per lasciare:
      // gli si dà il tempo di essere letto, così non sopravvive sulla successiva.
      await settle();
      const overlay = await page.screencast.showOverlay(directBanner(label));
      await sleep(PAUSE_MS);
      direct = { label, expectedUrl, consumed: false };
      try {
        return await original(...args);
      } finally {
        await sleep(PAUSE_MS / 2);
        direct = undefined;
        await overlay.dispose();
      }
    };
  }

  gateActions(page, settle);

  // A fine test lascia all'ultimo avviso il tempo di essere letto.
  return { settle };
}

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const announcer = enabled ? await announceNavigations(page, baseURL) : undefined;
    await use(page);
    await announcer?.settle();
  },
});

export { expect };

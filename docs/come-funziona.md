# Come funziona

Questo documento spiega i tre pezzi della strategia, le scelte di progetto e le insidie incontrate costruendola. Per adottarla in un altro progetto c'è la [guida all'integrazione](integrazione.md).

## Il principio

Tutto quello che serve a *guardare* un test sta fuori dall'applicazione, nel codice dei test, e si accende con una variabile d'ambiente:

- `PW_SHOW_ACTIONS=1` attiva la modalità "da guardare";
- senza la variabile, configurazione e fixture non fanno nulla e i test girano alla velocità normale.

L'unica eccezione è il ponte sugli eventi del Router, che vive nel sorgente dell'app ma non nel bundle di produzione.

## Pezzo 1: decorazioni native di Playwright

File: [playwright.config.ts](../playwright.config.ts)

Playwright espone un'API, `page.screencast`, che disegna annotazioni sopra la pagina. Nei test si configura dall'opzione `video`:

```ts
video: {
  mode: 'on',
  show: {
    actions: {
      duration: 1500,            // quanto resta visibile ogni azione
      position: 'bottom-right',  // dove compare il titolo dell'azione
      cursor: 'pointer',         // cursore animato da un'azione alla successiva
      style: {
        point: '…',              // CSS del punto di click
        highlight: '…',          // CSS del riquadro sull'elemento bersaglio
        title: '…',              // CSS del titolo dell'azione
      },
    },
    test: { level: 'step', position: 'bottom-left' }, // file, test e step correnti
  },
}
```

Tre cose da sapere:

- **Il cursore è attivo da subito; punto di click e riquadro no.** Compaiono solo se si assegna loro uno stile CSS.
- **Ogni azione viene rallentata** della durata dell'annotazione: il rallentamento è incluso, non serve `slowMo`.
- **Le annotazioni si vedono anche dal vivo**, nella finestra del browser in modalità headed, non solo nel video. Sono elementi disegnati nella pagina.

Versioni minime, secondo la documentazione di Playwright: 1.59 per le annotazioni, 1.61 per il cursore, 1.64 per gli stili di punto e riquadro.

## Pezzo 2: la fixture

File: [tests/fixtures.ts](../tests/fixtures.ts), [tests/pace.ts](../tests/pace.ts)

Le decorazioni native coprono le azioni sugli elementi. Non coprono i cambi di pagina: `page.goto()` non viene né annotato né rallentato, e una navigazione avviata dall'app non lascia alcun segno. La fixture si occupa di questo.

### Navigazioni dirette del test

La fixture sostituisce `goto`, `reload`, `goBack` e `goForward` della pagina con versioni che, prima di navigare, mostrano un banner arancione con la destinazione e fanno una pausa. Il banner è un overlay di Playwright (`page.screencast.showOverlay`), che sopravvive al cambio di pagina.

### Navigazioni avviate dall'app

Qui la fixture non può annunciare nulla in anticipo: può solo accorgersi che l'URL è cambiato. Usa due segnali di Playwright:

- l'evento `framenavigated` sul frame principale, che scatta sia per un nuovo documento sia per un cambio di rotta fatto con la History API;
- le richieste di navigazione (`request.isNavigationRequest()`), che permettono di distinguere i due casi: se il cambio di URL è preceduto dalla richiesta di un nuovo documento è un **reload completo**, altrimenti è un **cambio di rotta senza reload**.

Se il cambio di URL avviene mentre è in corso una navigazione diretta e corrisponde alla destinazione richiesta, è quella del test e non viene segnalato una seconda volta. Qualunque altro cambio è dell'app.

### A quale azione attribuire la navigazione

Per dire "dopo: click su «Salva ordine» · 0,7 s prima", la fixture deve sapere qual è stata l'ultima azione del test. Playwright non offre un aggancio pubblico per saperlo dal lato Node, quindi la fixture inietta nella pagina uno script (`addInitScript`) che ascolta `pointerdown`, `keydown` e `input` e li segnala al test tramite una funzione esposta (`exposeFunction`).

Quando l'URL cambia, la fixture confronta gli orari:

- se c'è stata un'azione negli ultimi 5 secondi, la indica insieme al tempo trascorso;
- altrimenti dichiara la navigazione "spontanea" (timer, redirect).

È una **deduzione temporale**: l'avviso mostra sempre il tempo trascorso proprio perché sia chi guarda a giudicare.

### Un evento alla volta

Senza accorgimenti il test prosegue mentre l'avviso è ancora a schermo, e chi guarda deve seguire due cose insieme. Per evitarlo:

- gli avvisi passano da una coda: uno nuovo sostituisce il precedente, senza lasciarne di orfani;
- le azioni del test (`click`, `fill`, `selectOption`…) attendono che l'avviso in corso abbia esaurito il suo tempo di lettura. Per ottenerlo la fixture avvolge i metodi di `Locator` e di `Page`;
- a fine test la fixture aspetta che l'ultimo avviso sia stato letto, altrimenti il video finirebbe prima.

I tempi sono in `tests/pace.ts` e si scalano tutti insieme con `PW_SHOW_PACE`.

## Pezzo 3: il ponte sugli eventi del Router

File: [demo-angular/src/app/router-debug.ts](../demo-angular/src/app/router-debug.ts), [demo-angular/src/app/app.config.ts](../demo-angular/src/app/app.config.ts)

Guardando solo l'URL restano invisibili parecchie cose: quale guard ha reindirizzato, una navigazione rifiutata (l'URL non cambia), un click su un link alla rotta già attiva, una vista cambiata con `skipLocationChange`.

Il ponte si iscrive a `Router.events` e inoltra un riassunto di ogni evento a un hook sulla pagina, `window.__pwdbgRouter`. L'hook esiste solo quando lo espone la fixture: durante il normale sviluppo il ponte si iscrive agli eventi ma non fa nulla.

| Evento del Router | Uso nella fixture |
|---|---|
| `NavigationStart` | Apre la navigazione; rileva `skipLocationChange` e l'origine (`popstate` = indietro/avanti) |
| `RoutesRecognized` | Elenca guard (`canMatch`, `canActivate`, `canActivateChild`) e resolver della rotta |
| `GuardsCheckStart` / `GuardsCheckEnd` / `ResolveStart` | Fase in corso, per dire chi ha interrotto la navigazione |
| `NavigationEnd` | Avviso blu, con guard superate e `redirectTo` |
| `NavigationCancel` con codice `Redirect` | Annotato nella "storia": l'avviso arriva con la navigazione successiva |
| `NavigationCancel` con altri codici | Avviso rosso "navigazione bloccata" |
| `NavigationError` | Avviso rosso "errore di navigazione" |
| `NavigationSkipped` | Avviso grigio "navigazione ignorata" |

Quando il ponte è attivo, i cambi di rotta vengono annunciati alla **conclusione** della navigazione del Router, così l'avviso è completo. Se il ponte non c'è, la fixture ripiega sul solo cambio di URL.

### Perché non finisce in produzione

```ts
// app.config.ts
...(typeof ngDevMode === 'undefined' || ngDevMode ? [provideRouterDebugBridge()] : []),
```

Nelle build di produzione Angular CLI sostituisce `ngDevMode` con la costante `false`. La condizione diventa codice morto, il bundler la elimina e, non essendoci più nessun riferimento a `provideRouterDebugBridge`, elimina anche `router-debug.ts`.

`ngDevMode` è il meccanismo che Angular usa al proprio interno, ma non è un'API documentata. Per questo la garanzia non è lasciata alla fiducia: [scripts/check-prod-bundle.mjs](../scripts/check-prod-bundle.mjs) compila in produzione e fallisce se trova `__pwdbgRouter` nel bundle. Lo script fallisce anche se il marcatore non esiste più nei sorgenti, per non passare a vuoto dopo una rinomina.

## Insidie incontrate

Sono i punti in cui la prima versione sbagliava. Vale la pena conoscerli prima di modificare il codice.

1. **Il titolo dell'azione in alto copre il menu.** Nella posizione predefinita (in alto a destra) finiva sopra il link che stava per essere cliccato. Titolo e informazioni sul test stanno in basso.
2. **`page.goto()` non viene annotato.** Senza la fixture, una pagina compare e scompare senza spiegazione.
3. **L'evento `change` ruba la paternità.** Su un campo di testo `change` scatta alla perdita del focus, cioè *dopo* il `pointerdown` del click successivo. La navigazione risultava attribuita al campo invece che al bottone. Lo script ascolta `input` e non `change`.
4. **Angular fa un `replaceState` a ogni avvio.** Il Router riscrive lo stesso URL per salvare il proprio stato. Un cambio verso lo stesso URL senza nuovo documento non è una navigazione e va ignorato.
5. **`showOverlay` con `duration` si risolve solo a overlay rimosso.** Usandolo per gli avvisi, ognuno ritardava i successivi di tutta la sua durata. La scadenza è gestita con un timer nella fixture.
6. **Due navigazioni ravvicinate lasciavano avvisi orfani.** Da qui la coda.
7. **Un reload va collegato solo alla prima navigazione del Router che lo segue.** Collegarlo "entro N secondi" attribuiva il reload anche a navigazioni successive.
8. **`NavigationSkipped` arriva senza `NavigationStart`.** Va gestito a parte, non come conclusione di una navigazione aperta.
9. **Il test rallentato supera il timeout predefinito di 30 secondi.** In modalità "da guardare" il limite per test è di 10 minuti.
10. **Avvolgere i `Locator` cambia lo stack degli errori.** In modalità "da guardare" la prima riga indica la fixture; la riga del test è quella successiva. La modalità normale non è toccata.

## Cosa non è stato verificato

- Applicazioni reali: lazy loading, resolver, più guard sulla stessa rotta, rotte figlie.
- Browser diversi da Chromium.
- Popup e nuove schede.
- Versioni di Angular precedenti alla 22 e applicazioni basate su `NgModule`.
- Errori di navigazione e navigazioni indietro/avanti: il codice li gestisce, la demo non li esercita.

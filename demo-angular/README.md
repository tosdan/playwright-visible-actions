# App Angular di esempio

Piccola applicazione Angular usata dai test del repository per esercitare ogni tipo di navigazione. Non è pensata per essere usata da sola: la documentazione è nel [README principale](../README.md).

| Scenario | Dove |
|---|---|
| `redirectTo` all'avvio | `src/app/app.routes.ts` |
| `router.navigate` dopo un salvataggio asincrono | `OrdersPage` in `src/app/pages.ts` |
| Reload completo con `window.location` | `OrderDetailPage` |
| Cambio di vista con `skipLocationChange` | `OrderDetailPage` |
| Guard che reindirizza al login | `authGuard` in `src/app/auth.ts` |
| Guard che rifiuta | `maintenanceGuard` |
| Sessione che scade da sola | `AdminPage` |

Il ponte di debug verso i test è in `src/app/router-debug.ts` ed è registrato, solo in sviluppo, in `src/app/app.config.ts`.

Per avviarla a mano:

```bash
npm start
```

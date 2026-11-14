// Ponte di debug SOLO PER LO SVILUPPO: inoltra gli eventi del Router ai test
// Playwright, che li mostrano negli avvisi di navigazione.
//
// - Non fa nulla se la pagina non è pilotata dai test: l'hook `__pwdbgRouter`
//   esiste solo quando lo espone la fixture (tests/fixtures.ts).
// - Non finisce nella build di produzione: è registrato in app.config.ts dietro
//   `ngDevMode`, che lì vale la costante `false`, e il bundler elimina tutto.
import { EnvironmentProviders, inject, provideEnvironmentInitializer } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Event,
  GuardsCheckEnd,
  GuardsCheckStart,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationSkippedCode,
  NavigationStart,
  ResolveStart,
  Router,
  RoutesRecognized,
} from '@angular/router';

const HOOK = '__pwdbgRouter';

const nameOf = (item: unknown) => (item as { name?: string } | null)?.name || '(anonima)';

function collect(root: ActivatedRouteSnapshot) {
  const guards: string[] = [];
  const resolvers: string[] = [];
  const visit = (route: ActivatedRouteSnapshot) => {
    const config = route.routeConfig;
    guards.push(...[...(config?.canMatch ?? []), ...(config?.canActivate ?? []), ...(config?.canActivateChild ?? [])].map(nameOf));
    resolvers.push(...Object.keys(config?.resolve ?? {}));
    route.children.forEach(visit);
  };
  visit(root);
  return { guards, resolvers };
}

function describe(event: Event, router: Router): Record<string, unknown> | undefined {
  if (event instanceof NavigationStart) {
    const extras = router.currentNavigation()?.extras;
    return {
      type: 'start',
      id: event.id,
      url: event.url,
      trigger: event.navigationTrigger,
      skipLocationChange: !!extras?.skipLocationChange,
    };
  }
  if (event instanceof RoutesRecognized)
    return { type: 'recognized', id: event.id, urlAfterRedirects: event.urlAfterRedirects, ...collect(event.state.root) };
  if (event instanceof GuardsCheckStart) return { type: 'phase', id: event.id, phase: 'guard' };
  if (event instanceof GuardsCheckEnd) return { type: 'phase', id: event.id, phase: event.shouldActivate ? 'guard-ok' : 'guard' };
  if (event instanceof ResolveStart) return { type: 'phase', id: event.id, phase: 'resolver' };
  if (event instanceof NavigationEnd)
    return { type: 'end', id: event.id, url: event.url, urlAfterRedirects: event.urlAfterRedirects };
  if (event instanceof NavigationCancel)
    return {
      type: 'cancel',
      id: event.id,
      url: event.url,
      code: event.code === undefined ? 'Sconosciuto' : NavigationCancellationCode[event.code],
      reason: event.reason,
    };
  if (event instanceof NavigationError)
    return { type: 'error', id: event.id, url: event.url, message: String(event.error?.message ?? event.error) };
  if (event instanceof NavigationSkipped)
    return {
      type: 'skipped',
      id: event.id,
      url: event.url,
      code: event.code === undefined ? 'Sconosciuto' : NavigationSkippedCode[event.code],
      reason: event.reason,
    };
  return undefined;
}

export function provideRouterDebugBridge(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    router.events.subscribe((event) => {
      const hook = (window as unknown as Record<string, unknown>)[HOOK];
      if (typeof hook !== 'function') return;
      try {
        const payload = describe(event, router);
        if (payload) hook(payload);
      } catch {
        // il debug non deve mai rompere l'app
      }
    });
  });
}

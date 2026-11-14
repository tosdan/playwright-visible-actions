import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideRouterDebugBridge } from './router-debug';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Solo in sviluppo. Nelle build di produzione `ngDevMode` è la costante
    // `false`: il ramo è codice morto e router-debug.ts non entra nel bundle.
    ...(typeof ngDevMode === 'undefined' || ngDevMode ? [provideRouterDebugBridge()] : []),
  ],
};

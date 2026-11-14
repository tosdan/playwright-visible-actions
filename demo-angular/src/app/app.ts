import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  template: `
    <header>
      <h1>Demo Angular</h1>
      <nav>
        <a routerLink="/orders">Ordini</a>
        <a routerLink="/admin">Admin</a>
        <a routerLink="/report">Report</a>
        <a routerLink="/archive">Archivio</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {}

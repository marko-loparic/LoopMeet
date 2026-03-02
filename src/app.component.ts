import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DbService } from './services/db.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
<div class="min-h-screen flex flex-col">
  <!-- Top Navigation -->
  <nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex">
          <div class="flex-shrink-0 flex items-center">
            <a routerLink="/" class="text-xl font-bold text-indigo-600 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"></path>
                <path d="M10 8l6 4-6 4V8z"></path>
              </svg>
              LoopMeet
            </a>
          </div>
          <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
            <a routerLink="/" routerLinkActive="border-indigo-500 text-gray-900" [routerLinkActiveOptions]="{exact: true}" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Dashboard
            </a>
            <a routerLink="/projects" routerLinkActive="border-indigo-500 text-gray-900" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Projects
            </a>
            <a routerLink="/users" routerLinkActive="border-indigo-500 text-gray-900" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Users
            </a>
            <a routerLink="/record" routerLinkActive="border-indigo-500 text-gray-900" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Record
            </a>
          </div>
        </div>

        <!-- Master Actions -->
        <div class="flex items-center gap-2">
            <!-- Hidden File Input -->
            <input type="file" #fileInput (change)="onFileSelected($event)" class="hidden" accept=".zip,.json">

            <button 
                (click)="fileInput.click()" 
                [disabled]="isImporting() || isExporting()"
                class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none disabled:opacity-50">
                @if (isImporting()) {
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    LOADING...
                } @else {
                    <svg class="-ml-0.5 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    MASTER LOAD
                }
            </button>
            
            <button 
                (click)="exportAllData()" 
                [disabled]="isImporting() || isExporting()"
                class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none disabled:opacity-50">
                @if (isExporting()) {
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    SAVING...
                } @else {
                    <svg class="-ml-0.5 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    MASTER SAVE
                }
            </button>
        </div>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="flex-1 bg-gray-50">
    <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 h-full">
      <router-outlet></router-outlet>
    </div>
  </main>
</div>
  `
})
export class AppComponent {
  db = inject(DbService);
  isExporting = signal(false);
  isImporting = signal(false);

  async exportAllData() {
    this.isExporting.set(true);
    try {
      // Get Master Backup as a ZIP blob
      const zipBlob = await this.db.getFullBackup();
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loopmeet-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to generate master backup.');
    } finally {
      this.isExporting.set(false);
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.isImporting.set(true);
      // We pass the file directly to the service now (no FileReader needed here)
      this.db.importData(file)
        .then(() => {
            alert('Master Data loaded successfully! Reloading page.');
            window.location.reload();
        })
        .catch((err) => {
            console.error(err);
            alert('Failed to import data: ' + err.message);
        })
        .finally(() => {
            this.isImporting.set(false);
            event.target.value = '';
        });
    }
  }
}
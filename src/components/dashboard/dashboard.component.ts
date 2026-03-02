import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DbService, Meeting, Project, Message, EmailActivity, User, Ticket } from '../../services/db.service';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, Type } from "@google/genai";

declare const GEMINI_API_KEY: string;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p class="text-sm text-gray-500">Overview of all project activities</p>
        </div>
        
        <div class="flex flex-wrap gap-2 items-center">
          <!-- Project Filter -->
          <div class="flex items-center gap-2 mr-4">
            <label for="project-filter" class="text-sm font-medium text-gray-700">Filter by Project:</label>
            <select 
              id="project-filter"
              [ngModel]="selectedProjectId()"
              (ngModelChange)="selectedProjectId.set($event)"
              class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="all">All Projects</option>
              @for (p of availableProjects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <!-- Import / Add Button -->
          <button (click)="openImportModal()" class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
             <svg class="-ml-1 mr-2 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
             </svg>
             Add / Import
          </button>

          <a routerLink="/record" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <svg class="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            New Recording
          </a>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Meetings</dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900">{{ filteredMeetings().length }}</dd>
          </div>
        </div>
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Emails</dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900">{{ filteredEmails().length }}</dd>
          </div>
        </div>
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Messages</dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900">{{ filteredMessages().length }}</dd>
          </div>
        </div>
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
             <dt class="text-sm font-medium text-gray-500 truncate">Total Hours</dt>
             <dd class="mt-1 text-2xl font-semibold text-gray-900">{{ totalHours() }}</dd>
          </div>
        </div>
      </div>

      <!-- Activity Feed -->
      <div class="bg-white shadow overflow-hidden sm:rounded-md">
        <div class="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 class="text-lg leading-6 font-medium text-gray-900">Recent Activity</h3>
        </div>
        <ul role="list" class="divide-y divide-gray-200">
          @if (activityFeed().length === 0) {
            <li class="px-4 py-8 text-center text-gray-500">
              No activity found for the selected filter.
            </li>
          }
          @for (item of activityFeed(); track item.id) {
            <li>
              <div class="block hover:bg-gray-50">
                <div class="px-4 py-4 sm:px-6">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center flex-1 min-w-0">
                      <!-- Icon based on type -->
                      <div class="flex-shrink-0 mr-3">
                        @switch (item.type) {
                          @case ('meeting') {
                            <span class="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-600">
                              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </span>
                          }
                          @case ('email') {
                            <span class="inline-flex items-center justify-center h-8 w-8 rounded-full bg-orange-100 text-orange-600">
                              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </span>
                          }
                          @case ('message') {
                            <span class="inline-flex items-center justify-center h-8 w-8 rounded-full bg-teal-100 text-teal-600">
                              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                            </span>
                          }
                        }
                      </div>

                      <div class="min-w-0 flex-1">
                        @if (item.type === 'meeting') {
                          <a [routerLink]="['/meeting', item.id]" class="text-sm font-medium text-indigo-600 truncate block">
                            {{ item.title }}
                          </a>
                        } @else if (item.type === 'email') {
                          <p class="text-sm font-medium text-gray-900 truncate">
                            {{ item.subject }}
                          </p>
                          <p class="text-xs text-gray-500 truncate">From: {{ item.sender }}</p>
                        } @else if (item.type === 'message') {
                          <button (click)="openMessageDetail(item)" class="text-sm font-medium text-indigo-600 truncate block hover:text-indigo-800">
                            {{ item.subject || 'Message' }}
                          </button>
                          <p class="text-xs text-gray-500 line-clamp-1">{{ item.content }}</p>
                        }
                      </div>
                    </div>

                    <div class="ml-2 flex-shrink-0 flex flex-col items-end">
                      @if (item.type === 'meeting') {
                        <p class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {{ formatDuration(item.duration) }}
                        </p>
                      }
                      <p class="mt-1 text-xs text-gray-500">
                        {{ item.date | date:'short' }}
                      </p>
                    </div>
                  </div>
                  
                  <div class="mt-2 flex items-center justify-between">
                    <div class="flex flex-wrap gap-2 items-center">
                        @if (item.type === 'meeting') {
                          @for (pid of getMeetingProjectIds(item); track pid) {
                             <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800">
                               {{ getProjectName(pid) }}
                               <button (click)="removeProject(item, pid)" class="ml-1 text-indigo-400 hover:text-indigo-900 focus:outline-none">
                                 <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                   <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                 </svg>
                               </button>
                             </span>
                          }
                          <div class="relative inline-block text-left">
                             <select 
                               (change)="addProject(item, $event)"
                               class="block w-full pl-2 pr-8 py-0.5 text-[10px] border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md">
                               <option value="" disabled selected>+ Project</option>
                               @for (p of availableProjects(); track p.id) {
                                 <option [value]="p.id" [disabled]="hasProject(item, p.id)">{{ p.name }}</option>
                               }
                             </select>
                          </div>
                        } @else {
                          @if (item.projectId) {
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-800">
                              {{ getProjectName(item.projectId) }}
                            </span>
                          }
                        }
                    </div>
                  </div>
                </div>
              </div>
            </li>
          }
        </ul>
      </div>
    </div>

    <!-- Unified Add / Import Modal -->
    @if (showImportModal()) {
      <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" (click)="closeImportModal()"></div>
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            
            <!-- Tabs -->
            <div class="border-b border-gray-200">
              <nav class="-mb-px flex" aria-label="Tabs">
                <button (click)="activeModalTab.set('create')" 
                   [class]="activeModalTab() === 'create' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                   class="w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm">
                   New Meeting
                </button>
                <button (click)="activeModalTab.set('message')" 
                   [class]="activeModalTab() === 'message' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                   class="w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm">
                   Add Message
                </button>
                <button (click)="activeModalTab.set('restore')" 
                   [class]="activeModalTab() === 'restore' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                   class="w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm">
                   Restore Backup
                </button>
              </nav>
            </div>

            <!-- Content -->
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              
              <!-- Tab 1: Create New -->
              @if (activeModalTab() === 'create') {
                  <div class="space-y-4">
                      <p class="text-sm text-gray-500">Upload an audio/video recording or provide a transcript to add an external meeting.</p>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700">Meeting Title</label>
                        <input type="text" [(ngModel)]="createTitle" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-gray-700">Date & Time</label>
                        <input type="datetime-local" [(ngModel)]="createDate" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-gray-700">Media File (Audio/Video)</label>
                        <div class="mt-1 flex items-center">
                            <input type="file" accept="audio/*,video/*" (change)="onNewMediaSelected($event)" class="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                        </div>
                        <p class="text-xs text-gray-400 mt-1">Optional. If skipped, you can rely on the transcript.</p>
                      </div>

                      <div class="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-3">
                          <h4 class="text-sm font-medium text-gray-900">Transcript (Optional)</h4>
                          
                          <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Upload File (.txt, .vtt, .srt)</label>
                            <input type="file" accept=".txt,.vtt,.srt" (change)="onNewTranscriptSelected($event)" class="block w-full text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white file:text-indigo-700 hover:file:bg-indigo-50 border border-gray-300 rounded-md">
                          </div>

                          <div class="relative flex py-1 items-center">
                              <div class="flex-grow border-t border-gray-300"></div>
                              <span class="flex-shrink-0 mx-2 text-xs text-gray-400">OR</span>
                              <div class="flex-grow border-t border-gray-300"></div>
                          </div>

                          <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Paste Text Directly</label>
                            <textarea [(ngModel)]="createTranscriptText" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-xs border-gray-300 rounded-md p-2" placeholder="Paste transcript content here..."></textarea>
                          </div>
                      </div>
                  </div>
                  
                  <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                    <button (click)="createMeeting()" [disabled]="isCreating() || (!createMediaFile && !createTranscriptFile && !createTranscriptText.trim())" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none disabled:opacity-50 sm:col-start-2 sm:text-sm">
                       @if(isCreating()) { Creating... } @else { Create Meeting }
                    </button>
                    <button (click)="closeImportModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                       Cancel
                    </button>
                  </div>
              }

              <!-- Tab: Add Message -->
              @if (activeModalTab() === 'message') {
                  <div class="space-y-4">
                      <p class="text-sm text-gray-500">Copy and paste a message (e.g. from Slack or Teams) to track it in your project timeline.</p>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700">Project (Optional)</label>
                        <select [(ngModel)]="messageProjectId" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                           <option value="">Unassigned</option>
                           @for (p of availableProjects(); track p.id) {
                             <option [value]="p.id">{{ p.name }}</option>
                           }
                        </select>
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-gray-700">Date & Time</label>
                        <input type="datetime-local" [(ngModel)]="messageDate" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-gray-700">Subject <span class="text-red-500">*</span></label>
                        <input type="text" [(ngModel)]="messageSubject" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="e.g. Project Update">
                      </div>

                      <div class="relative">
                        <label class="block text-sm font-medium text-gray-700">Message Content</label>
                        <textarea 
                          name="messageContent"
                          [(ngModel)]="messageContent" 
                          (input)="onMessageInput($event, 'new')"
                          rows="5" 
                          class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2" 
                          placeholder="Paste message here... Use @ or # to tag users or projects"></textarea>
                        
                        <!-- Hashtag Menu -->
                        @if (showHashtagMenu() && hashtagSource() === 'new') {
                          <div class="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                            @for (item of hashtagResults(); track item.id) {
                              <button 
                                (click)="insertHashtag(item)"
                                class="w-full text-left px-4 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2">
                                <span class="text-xs font-bold uppercase px-1 rounded" [class]="item.type === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'">
                                  {{ item.type }}
                                </span>
                                {{ item.name }}
                              </button>
                            }
                          </div>
                        }
                      </div>
                  </div>
                  
                  <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                    <button (click)="saveMessage()" [disabled]="!messageContent.trim() || !messageSubject.trim()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:col-start-2 sm:text-sm">
                       Save Message
                    </button>
                    <button (click)="closeImportModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                       Cancel
                    </button>
                  </div>
              }

              <!-- Tab 2: Restore Backup -->
              @if (activeModalTab() === 'restore') {
                  <div class="space-y-4">
                    <p class="text-sm text-gray-500">Restore a single meeting from a legacy JSON export and its media file.</p>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Meeting JSON</label>
                        <input type="file" accept=".json" (change)="onImportJsonSelected($event)" class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Recording (Video/Audio)</label>
                        <input type="file" accept="video/*,audio/*" (change)="onImportMediaSelected($event)" class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    </div>
                    @if (importError()) {
                        <div class="rounded-md bg-red-50 p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                            </svg>
                            </div>
                            <div class="ml-3">
                            <h3 class="text-sm font-medium text-red-800">Import Error</h3>
                            <div class="mt-2 text-sm text-red-700"><p>{{ importError() }}</p></div>
                            </div>
                        </div>
                        </div>
                    }
                  </div>
                  
                  <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                    <button (click)="confirmRestore()" [disabled]="!canRestore()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none disabled:opacity-50 sm:col-start-2 sm:text-sm">
                       Restore
                    </button>
                    <button (click)="closeImportModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                       Cancel
                    </button>
                  </div>
              }
            </div>
          </div>
        </div>
      </div>
    }
    <!-- Message Detail Modal -->
    @if (viewingMessage()) {
      <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" (click)="closeMessageDetail()"></div>
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-medium text-gray-900">Message Details</h3>
                <button (click)="closeMessageDetail()" class="text-gray-400 hover:text-gray-500">
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Left Column: Content & AI Analysis -->
                <div class="space-y-6 overflow-y-auto max-h-[700px] pr-2">
                  <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                      <div class="flex flex-col">
                        <span class="text-xs font-medium text-gray-500">{{ viewingMessage()?.date | date:'MMM d, y, h:mm a' }}</span>
                        @if (viewingMessage()?.subject) {
                          <h4 class="text-sm font-bold text-gray-900 mt-1">{{ viewingMessage()?.subject }}</h4>
                        }
                      </div>
                      @if (viewingMessage()?.projectId) {
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800">
                          {{ getProjectName(viewingMessage()!.projectId!) }}
                        </span>
                      }
                    </div>

                    <!-- Chat-like Message Display -->
                    <div class="space-y-4 max-h-[400px] overflow-y-auto pr-2 mb-4 bg-white p-4 rounded-lg border border-gray-100">
                      @for (bubble of parseMessageContent(viewingMessage()?.content || ''); track $index) {
                        <div class="flex flex-col" [class.items-end]="bubble.isAppend" [class.items-start]="!bubble.isAppend">
                          @if (bubble.header) {
                            <span class="text-[10px] text-gray-400 mb-1 px-2">{{ bubble.header }}</span>
                          }
                          <div class="max-w-[90%] rounded-2xl px-4 py-2 shadow-sm"
                            [class.bg-indigo-600]="bubble.isAppend" 
                            [class.text-white]="bubble.isAppend"
                            [class.bg-gray-100]="!bubble.isAppend"
                            [class.text-gray-800]="!bubble.isAppend"
                            [class.rounded-tr-none]="bubble.isAppend"
                            [class.rounded-tl-none]="!bubble.isAppend">
                            <p class="text-sm whitespace-pre-wrap">{{ bubble.text }}</p>
                          </div>
                        </div>
                      }
                    </div>
                    
                    <!-- Append Message Input -->
                    <div class="mt-4 pt-4 border-t border-gray-200 relative">
                      <textarea 
                        name="appendMessageContent"
                        [ngModel]="newMessageContent()"
                        (ngModelChange)="newMessageContent.set($event)"
                        (input)="onMessageInput($event, 'append')"
                        rows="2"
                        placeholder="Add a new message below... Use @ or # to tag"
                        class="block w-full px-3 py-2 text-xs border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"></textarea>
                      
                      <!-- Hashtag Menu for Append -->
                      @if (showHashtagMenu() && hashtagSource() === 'append') {
                        <div class="absolute z-10 bottom-full mb-1 w-full bg-white shadow-lg max-h-40 rounded-md py-1 text-xs ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                          @for (item of hashtagResults(); track item.id) {
                            <button 
                              (click)="insertHashtag(item)"
                              class="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2">
                              <span class="text-[10px] font-bold uppercase px-1 rounded" [class]="item.type === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'">
                                {{ item.type }}
                              </span>
                              {{ item.name }}
                            </button>
                          }
                        </div>
                      }

                      <div class="flex justify-end">
                        <button 
                          (click)="appendMessage()"
                          [disabled]="!newMessageContent().trim()"
                          class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                          Append Message
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Project Artifacts -->
                  @if (viewingMessage()?.projectId) {
                    <div class="border-t pt-4">
                      <h4 class="text-sm font-semibold text-gray-900 mb-3">Project Artifacts</h4>
                      <div class="space-y-2">
                        @if (projectArtifacts().length === 0) {
                          <p class="text-xs text-gray-500 italic">No other artifacts for this project.</p>
                        }
                        @for (art of projectArtifacts(); track art.id) {
                          <div class="flex items-center gap-3 p-2 bg-white border border-gray-100 rounded hover:bg-gray-50 transition-colors">
                            <span class="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-[10px] font-bold uppercase"
                              [class]="art.type === 'meeting' ? 'bg-indigo-100 text-indigo-600' : 
                                       art.type === 'email' ? 'bg-orange-100 text-orange-600' : 
                                       art.type === 'message' ? 'bg-teal-100 text-teal-600' : 
                                       art.type === 'ticket' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'">
                              {{ art.type[0] }}
                            </span>
                            <div class="min-w-0 flex-1">
                              <p class="text-xs font-medium text-gray-900 truncate">
                                {{ art.title || art.subject || art.content }}
                              </p>
                              <p class="text-[10px] text-gray-500">
                                {{ art.date | date:'shortDate' }}
                              </p>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }

                  <div class="border-t pt-4">
                    <div class="flex justify-between items-center mb-4">
                      <h4 class="text-sm font-semibold text-gray-900">AI Analysis</h4>
                      <button 
                        (click)="analyzeMessageAI()" 
                        [disabled]="isAnalyzing()"
                        class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50">
                        @if (isAnalyzing()) { Analyzing... } @else { Analyze & Suggest Tickets }
                      </button>
                    </div>

                    @if (showTicketSuggestions()) {
                      <div class="space-y-3">
                        @if (isAnalyzing()) {
                          <div class="animate-pulse space-y-2">
                            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                          </div>
                        } @else if (suggestedTickets().length === 0) {
                          <p class="text-xs text-gray-500">No tickets suggested.</p>
                        } @else {
                          @for (ticket of suggestedTickets(); track $index) {
                            <div class="p-3 bg-white border border-gray-200 rounded-md shadow-sm hover:border-indigo-300 transition-colors">
                              <div class="flex justify-between items-start">
                                <h5 class="text-xs font-bold text-gray-900">{{ ticket.title }}</h5>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" 
                                  [class]="ticket.priority === 'High' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'">
                                  {{ ticket.priority }}
                                </span>
                              </div>
                              <p class="text-[10px] text-gray-500 mt-1">{{ ticket.description }}</p>
                              <div class="mt-2 flex items-center gap-2">
                                <select #targetArt class="text-[10px] border-gray-300 rounded-md py-0.5 pl-1 pr-6 focus:ring-indigo-500 focus:border-indigo-500">
                                  <option value="">No link</option>
                                  @for (art of projectArtifacts(); track art.id) {
                                    @if (art.type === 'meeting') {
                                      <option [value]="art.id">Link to: {{ art.title }}</option>
                                    }
                                  }
                                </select>
                                <button 
                                  (click)="createSuggestedTicket(ticket, targetArt.value)"
                                  class="text-[10px] font-medium text-indigo-600 hover:text-indigo-800">
                                  + Create Ticket
                                </button>
                              </div>
                            </div>
                          }
                        }
                      </div>
                    }
                  </div>
                </div>

                <!-- Right Column: Continue Chat -->
                <div class="flex flex-col h-[500px] border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <div class="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h4 class="text-xs font-semibold text-gray-700">Continue Chat</h4>
                  </div>
                  
                  <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                    @if (messageChat().length === 0) {
                      <div class="text-center py-10">
                        <svg class="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p class="mt-2 text-xs text-gray-500">Ask the AI about this message...</p>
                      </div>
                    }
                    @for (chat of messageChat(); track $index) {
                      <div [class]="chat.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
                        <div [class]="chat.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800'"
                          class="max-w-[85%] rounded-lg px-3 py-2 text-xs shadow-sm">
                          {{ chat.text }}
                        </div>
                      </div>
                    }
                    @if (isChatting()) {
                      <div class="flex justify-start">
                        <div class="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm animate-pulse">
                          Thinking...
                        </div>
                      </div>
                    }
                  </div>

                  <div class="p-3 bg-white border-t border-gray-200">
                    <div class="flex gap-2">
                      <input 
                        type="text" 
                        [(ngModel)]="chatInput"
                        (keyup.enter)="continueMessageChat()"
                        placeholder="Type a question..."
                        class="flex-1 min-w-0 block w-full px-3 py-2 text-xs border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                      <button 
                        (click)="continueMessageChat()"
                        [disabled]="isChatting() || !chatInput().trim()"
                        class="inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50">
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class DashboardComponent implements OnInit {
  db = inject(DbService);
  meetings = signal<Meeting[]>([]);
  emails = signal<EmailActivity[]>([]);
  messages = signal<Message[]>([]);
  availableProjects = signal<Project[]>([]);
  selectedProjectId = signal<string>('all');

  thisMonthCount = signal(0);
  totalHours = signal('0h');

  // Filtered lists
  filteredMeetings = computed(() => {
    const pid = this.selectedProjectId();
    const data = this.meetings();
    if (pid === 'all') return data;
    return data.filter(m => 
      m.projectId === pid || (m.projectIds && m.projectIds.includes(pid))
    );
  });

  filteredEmails = computed(() => {
    const pid = this.selectedProjectId();
    const data = this.emails();
    if (pid === 'all') return data;
    return data.filter(e => e.projectId === pid);
  });

  filteredMessages = computed(() => {
    const pid = this.selectedProjectId();
    const data = this.messages();
    if (pid === 'all') return data;
    return data.filter(m => m.projectId === pid);
  });

  // Unified activity feed
  activityFeed = computed(() => {
    const items: any[] = [
      ...this.filteredMeetings().map(m => ({ ...m, type: 'meeting' })),
      ...this.filteredEmails().map(e => ({ ...e, type: 'email' })),
      ...this.filteredMessages().map(msg => ({ ...msg, type: 'message' }))
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // Unified Modal State
  showImportModal = signal(false);
  activeModalTab = signal<'create' | 'message' | 'restore'>('create');

  // -- Message Detail State --
  viewingMessage = signal<Message | null>(null);
  messageChat = signal<{ role: 'user' | 'model', text: string }[]>([]);
  isChatting = signal(false);
  chatInput = signal('');
  newMessageContent = signal('');
  projectArtifacts = signal<any[]>([]);
  
  // -- AI Analysis State --
  isAnalyzing = signal(false);
  suggestedTickets = signal<Ticket[]>([]);
  showTicketSuggestions = signal(false);

  // -- Hashtag State --
  users = signal<User[]>([]);
  hashtagResults = signal<{ type: 'user' | 'project', id: string, name: string }[]>([]);
  showHashtagMenu = signal(false);
  hashtagSource = signal<'new' | 'append'>('new');
  hashtagTrigger = signal<'#' | '@'>('#');

  // -- Create Tab State --
  createTitle = '';
  createDate = '';
  createMediaFile: File | null = null;
  createTranscriptFile: File | null = null;
  createTranscriptText = ''; // Model for pasted text
  isCreating = signal(false);

  // -- Message Tab State --
  messageSubject = '';
  messageContent = '';
  messageDate = '';
  messageProjectId = '';

  // -- Restore Tab State --
  importJsonFile: File | null = null;
  importMediaFile: File | null = null;
  importError = signal('');

  async ngOnInit() {
    this.loadData();
    this.availableProjects.set(await this.db.getAllProjects());
    this.users.set(await this.db.getAllUsers());
  }

  async loadData() {
    const [meetings, emails, messages] = await Promise.all([
      this.db.getAllMeetings(),
      this.db.getAllEmails(),
      this.db.getAllMessages()
    ]);

    this.meetings.set(meetings);
    this.emails.set(emails);
    this.messages.set(messages);

    const now = new Date();
    this.thisMonthCount.set(meetings.filter(m => 
      m.date.getMonth() === now.getMonth() && m.date.getFullYear() === now.getFullYear()
    ).length);

    const totalSeconds = meetings.reduce((acc, m) => acc + m.duration, 0);
    this.totalHours.set((totalSeconds / 3600).toFixed(1) + 'h');
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // --- Message Detail Logic ---

  async openMessageDetail(msg: Message) {
    this.viewingMessage.set(msg);
    this.messageChat.set([]);
    this.suggestedTickets.set([]);
    this.showTicketSuggestions.set(false);
    this.newMessageContent.set('');
    
    const pid = msg.projectId;
    if (pid) {
      const [meetings, emails, messages, tickets] = await Promise.all([
        this.db.getAllMeetings(),
        this.db.getAllEmails(),
        this.db.getAllMessages(),
        this.db.getAllTickets()
      ]);

      const artifacts = [
        ...meetings.filter(m => {
          const mPids = this.getMeetingProjectIds(m);
          return mPids.includes(pid);
        }).map(m => ({ ...m, type: 'meeting' })),
        ...emails.filter(e => e.projectId === pid).map(e => ({ ...e, type: 'email' })),
        ...messages.filter(m => m.projectId === pid && m.id !== msg.id).map(m => ({ ...m, type: 'message' })),
        ...tickets.filter(t => t.projectId === pid).map(t => ({ ...t, type: 'ticket' }))
      ];
      
      const getArtDate = (art: any) => {
        const d = art.date || art.startDate;
        return d ? new Date(d).getTime() : 0;
      };

      this.projectArtifacts.set(artifacts.sort((a, b) => getArtDate(b) - getArtDate(a)));
    } else {
      this.projectArtifacts.set([]);
    }
  }

  async appendMessage() {
    const content = this.newMessageContent().trim();
    const msg = this.viewingMessage();
    if (!content || !msg) return;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
    
    const currentUserEmail = 'marko.loparic@artidis.com';
    const currentUser = this.users().find(u => u.email === currentUserEmail)?.name || currentUserEmail;
    
    const appendHeader = `\n\n${currentUser}  ${formattedDate}\n`;
    const updatedContent = msg.content + appendHeader + content;
    const updatedMsg = { ...msg, content: updatedContent };
    
    await this.db.addMessage(updatedMsg);
    this.viewingMessage.set(updatedMsg);
    this.newMessageContent.set('');
    
    // Update local list
    this.messages.update(msgs => msgs.map(m => m.id === msg.id ? updatedMsg : m));
  }

  closeMessageDetail() {
    this.viewingMessage.set(null);
  }

  async continueMessageChat() {
    const input = this.chatInput().trim();
    if (!input || !this.viewingMessage()) return;

    const msg = this.viewingMessage()!;
    this.messageChat.update(chat => [...chat, { role: 'user', text: input }]);
    this.chatInput.set('');
    this.isChatting.set(true);

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `Original Message: ${msg.content}\n\nUser Question: ${input}` }] }
        ],
        config: {
          systemInstruction: "You are a helpful assistant discussing a specific project message. Keep responses concise and focused on the message context."
        }
      });

      const reply = response.text || "I'm sorry, I couldn't process that.";
      this.messageChat.update(chat => [...chat, { role: 'model', text: reply }]);
    } catch (e) {
      console.error(e);
      this.messageChat.update(chat => [...chat, { role: 'model', text: "Error: AI chat failed." }]);
    } finally {
      this.isChatting.set(false);
    }
  }

  async analyzeMessageAI() {
    const msg = this.viewingMessage();
    if (!msg) return;

    this.isAnalyzing.set(true);
    this.showTicketSuggestions.set(true);

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this message and suggest up to 3 tickets (tasks, bugs, or stories). 
        Message: "${msg.content}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING, description: "Task, Bug, or Story" },
                priority: { type: Type.STRING, description: "High, Medium, or Low" }
              },
              required: ["title", "description", "type", "priority"]
            }
          }
        }
      });

      const tickets = JSON.parse(response.text || "[]");
      this.suggestedTickets.set(tickets);
    } catch (e) {
      console.error(e);
      alert('AI analysis failed.');
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  async createSuggestedTicket(ticket: Ticket, targetArtifactId?: string) {
    const msg = this.viewingMessage();
    if (!msg) return;

    ticket.projectId = msg.projectId;
    await this.db.addTicket(ticket);
    
    // If a target artifact (meeting) is selected, link the ticket to it
    if (targetArtifactId) {
      const meeting = await this.db.getMeeting(targetArtifactId);
      if (meeting) {
        if (!meeting.tickets) meeting.tickets = [];
        meeting.tickets.push(ticket);
        await this.db.updateMeeting(meeting);
      }
    }
    
    // Remove from suggestions
    this.suggestedTickets.update(ts => ts.filter(t => t !== ticket));
    
    if (ticket.projectId) {
      await this.db.emitArtifactCreated(ticket.projectId, {
        type: 'ticket',
        id: ticket.id,
        title: ticket.title
      });
    }
    
    alert('Ticket created successfully!');
    
    // Refresh artifacts list
    if (msg.projectId) {
      const newTicketArt = { ...ticket, type: 'ticket' };
      const getArtDate = (art: any) => {
        const d = art.date || art.startDate;
        return d ? new Date(d).getTime() : 0;
      };
      this.projectArtifacts.update(arts => [newTicketArt, ...arts].sort((a, b) => getArtDate(b) - getArtDate(a)));
    }
  }

  // --- Hashtag Logic ---

  onMessageInput(event: any, source: 'new' | 'append' = 'new') {
    this.hashtagSource.set(source);
    const text = event.target.value;
    const cursor = event.target.selectionStart;
    const lastWord = text.slice(0, cursor).split(/\s/).pop();

    if (lastWord?.startsWith('#') || lastWord?.startsWith('@')) {
      this.hashtagTrigger.set(lastWord[0] as '#' | '@');
      const query = lastWord.slice(1).toLowerCase();
      const results: any[] = [];
      
      this.users().forEach(u => {
        if (u.name.toLowerCase().includes(query)) {
          results.push({ type: 'user', id: u.id, name: u.name });
        }
      });

      this.availableProjects().forEach(p => {
        if (p.name.toLowerCase().includes(query)) {
          results.push({ type: 'project', id: p.id, name: p.name });
        }
      });

      this.hashtagResults.set(results.slice(0, 5));
      this.showHashtagMenu.set(results.length > 0);
    } else {
      this.showHashtagMenu.set(false);
    }
  }

  insertHashtag(item: { type: 'user' | 'project', id: string, name: string }) {
    const source = this.hashtagSource();
    const textareaName = source === 'new' ? 'messageContent' : 'appendMessageContent';
    const textarea = document.querySelector(`textarea[name="${textareaName}"]`) as HTMLTextAreaElement;
    if (!textarea) return;

    const text = source === 'new' ? this.messageContent : this.newMessageContent();
    const cursor = textarea.selectionStart;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    
    const lastSpace = before.lastIndexOf(' ');
    const trigger = this.hashtagTrigger();
    const newBefore = before.slice(0, lastSpace + 1) + `${trigger}${item.name} `;
    
    if (source === 'new') {
      this.messageContent = newBefore + after;
    } else {
      this.newMessageContent.set(newBefore + after);
    }
    
    this.showHashtagMenu.set(false);
    textarea.focus();
  }

  getMeetingProjectIds(m: Meeting): string[] {
      const ids = new Set<string>();
      if (m.projectId) ids.add(m.projectId);
      if (m.projectIds) m.projectIds.forEach(id => ids.add(id));
      return Array.from(ids);
  }

  getProjectName(id: string): string {
      return this.availableProjects().find(p => p.id === id)?.name || 'Unknown';
  }

  hasProject(m: Meeting, pid: string): boolean {
      return this.getMeetingProjectIds(m).includes(pid);
  }

  async addProject(m: Meeting, event: Event) {
      const select = event.target as HTMLSelectElement;
      const pid = select.value;
      if (!pid) return;

      if (!m.projectIds) m.projectIds = [];
      
      if (m.projectId && !m.projectIds.includes(m.projectId)) {
          m.projectIds.push(m.projectId);
      }
      
      if (!m.projectIds.includes(pid)) {
          m.projectIds.push(pid);
          if (!m.projectId) m.projectId = pid;
          
          await this.db.updateMeeting(m);
          this.meetings.update(ms => [...ms]); 
      }
      select.value = ""; 
  }

  async removeProject(m: Meeting, pid: string) {
      if (!m.projectIds) m.projectIds = [];
      if (m.projectId === pid) m.projectId = undefined;
      m.projectIds = m.projectIds.filter(id => id !== pid);
      if (!m.projectId && m.projectIds.length > 0) m.projectId = m.projectIds[0];

      await this.db.updateMeeting(m);
      this.meetings.update(ms => [...ms]);
  }

  parseMessageContent(content: string): { header?: string, text: string, isAppend: boolean }[] {
    if (!content) return [];
    
    // Split by the pattern we use for appending: \n\nUser Name  DD/MM/YY HH:mm\n
    // We look for \n\n followed by something that looks like a name and date
    const parts = content.split(/\n\n(?=.+  \d{2}\/\d{2}\/\d{2} \d{2}:\d{2}\n)/);
    
    return parts.map((part, index) => {
      if (index === 0) {
        return { text: part.trim(), isAppend: false };
      }
      
      // For appended parts, the first line is the header
      const lines = part.trim().split('\n');
      const header = lines[0];
      const text = lines.slice(1).join('\n');
      
      return { header, text, isAppend: true };
    });
  }

  // --- Unified Modal Logic ---

  openImportModal() {
      // Reset State
      this.createTitle = '';
      this.createDate = new Date().toISOString().slice(0, 16); // yyyy-MM-ddThh:mm
      this.createMediaFile = null;
      this.createTranscriptFile = null;
      this.createTranscriptText = '';
      this.isCreating.set(false);

      this.messageContent = '';
      this.messageDate = new Date().toISOString().slice(0, 16);
      this.messageProjectId = '';
      
      this.importJsonFile = null;
      this.importMediaFile = null;
      this.importError.set('');
      
      this.activeModalTab.set('create');
      this.showImportModal.set(true);
  }

  closeImportModal() {
    this.showImportModal.set(false);
  }

  // --- Message Tab Logic ---

  async saveMessage() {
      if (!this.messageContent.trim() || !this.messageSubject.trim()) return;

      const msg: Message = {
          id: uuidv4(),
          subject: this.messageSubject.trim() || undefined,
          content: this.messageContent,
          date: new Date(this.messageDate || new Date()),
          projectId: this.messageProjectId || undefined
      };

      await this.db.addMessage(msg);
      this.messageSubject = '';
      this.messageContent = '';
      this.messageProjectId = '';
      this.closeImportModal();
      this.loadData();
      alert('Message saved successfully!');
  }

  // --- Create Tab Logic ---

  onNewMediaSelected(event: any) {
      this.createMediaFile = event.target.files[0] || null;
      // Auto-fill title if empty
      if (this.createMediaFile && !this.createTitle) {
          this.createTitle = this.createMediaFile.name.replace(/\.[^/.]+$/, "");
      }
  }

  onNewTranscriptSelected(event: any) {
      this.createTranscriptFile = event.target.files[0] || null;
  }

  async createMeeting() {
      if (!this.createTitle.trim()) {
          this.createTitle = 'Untitled Meeting';
      }
      this.isCreating.set(true);

      try {
          const id = uuidv4();
          let transcriptText = '';

          // Read Transcript from file OR text
          if (this.createTranscriptFile) {
              transcriptText = await this.createTranscriptFile.text();
          } else if (this.createTranscriptText.trim()) {
              transcriptText = this.createTranscriptText.trim();
          }

          // Create Meeting Object
          const meeting: Meeting = {
              id,
              title: this.createTitle,
              date: this.createDate ? new Date(this.createDate) : new Date(),
              duration: 0, // Unknown initially
              participants: [],
              tags: ['imported'],
              transcript: transcriptText,
              isVideo: this.createMediaFile ? this.createMediaFile.type.startsWith('video') : false
          };

          // Save
          // If no media file, we save an empty blob to satisfy the service
          const blobToSave = this.createMediaFile || new Blob([], { type: 'application/octet-stream' });
          await this.db.saveMeeting(meeting, blobToSave);

          // Emit Event
          if (meeting.projectId) {
              await this.db.emitArtifactCreated(meeting.projectId, {
                  type: 'meeting',
                  id: meeting.id,
                  title: meeting.title,
                  url: `/meeting/${meeting.id}`
              });
          } else if (meeting.projectIds) {
              for (const pid of meeting.projectIds) {
                  await this.db.emitArtifactCreated(pid, {
                      type: 'meeting',
                      id: meeting.id,
                      title: meeting.title,
                      url: `/meeting/${meeting.id}`
                  });
              }
          }

          this.closeImportModal();
          this.loadData();
          alert('Meeting created successfully!');

      } catch (e: any) {
          console.error(e);
          alert('Error creating meeting: ' + e.message);
      } finally {
          this.isCreating.set(false);
      }
  }

  // --- Restore Tab Logic ---

  onImportJsonSelected(event: any) {
    this.importJsonFile = event.target.files[0] || null;
    this.importError.set('');
  }

  onImportMediaSelected(event: any) {
    this.importMediaFile = event.target.files[0] || null;
    this.importError.set('');
  }

  canRestore(): boolean {
    return !!this.importJsonFile && !!this.importMediaFile;
  }

  confirmRestore() {
    if (!this.importJsonFile || !this.importMediaFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonStr = e.target?.result as string;
        let json: any;
        try {
            json = JSON.parse(jsonStr);
        } catch {
            throw new Error('The file is not a valid JSON file.');
        }

        if (json.appName === 'LoopMeet' && (json.meetings || Array.isArray(json))) {
             throw new Error('This looks like a Master Backup. Use "MASTER LOAD" in top bar.');
        }

        const meeting = json as Meeting;
        if (!meeting.id || !meeting.title) {
          throw new Error('Invalid meeting JSON.');
        }

        meeting.date = new Date(meeting.date);
        if (isNaN(meeting.date.getTime())) meeting.date = new Date();

        await this.db.saveMeeting(meeting, this.importMediaFile!);

        // Emit Event
        if (meeting.projectId) {
            await this.db.emitArtifactCreated(meeting.projectId, {
                type: 'meeting',
                id: meeting.id,
                title: meeting.title,
                url: `/meeting/${meeting.id}`
            });
        } else if (meeting.projectIds) {
            for (const pid of meeting.projectIds) {
                await this.db.emitArtifactCreated(pid, {
                    type: 'meeting',
                    id: meeting.id,
                    title: meeting.title,
                    url: `/meeting/${meeting.id}`
                });
            }
        }

        this.closeImportModal();
        alert('Meeting restored successfully!');
        this.loadData();

      } catch (err: any) {
        console.error(err);
        this.importError.set(err.message);
      }
    };
    reader.readAsText(this.importJsonFile);
  }
}
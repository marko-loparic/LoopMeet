import { Component, OnInit, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService, Meeting, Project, Ticket, User, AIJob, MeetingSpeakerMap } from '../../services/db.service';
import { AiService } from '../../services/ai.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { v4 as uuidv4 } from 'uuid';

interface TranscriptSegment {
  timestamp: string;
  speaker: string;
  originalSpeaker: string;
  text: string;
  colorClass: string;
}

@Component({
  selector: 'app-meeting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    @if (meeting()) {
      <div class="h-full flex flex-col space-y-6">
        <!-- Header -->
        <div class="bg-white shadow sm:rounded-lg p-6">
          <div class="md:flex md:items-center md:justify-between">
            <div class="flex-1 min-w-0">
              <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                {{ meeting()?.title }}
              </h2>
              <div class="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                <div class="mt-2 flex items-center text-sm text-gray-500">
                  📅 {{ meeting()?.date | date:'medium' }}
                </div>
                <div class="mt-2 flex items-center text-sm text-gray-500">
                  ⏱️ {{ formatDuration(meeting()!.duration) }}
                </div>
              </div>
            </div>
            <div class="mt-4 flex flex-col md:flex-row gap-3 md:mt-0 md:ml-4 items-center">
               <!-- Media Player -->
               @if (meeting()?.isVideo) {
                 <video [src]="audioUrl" controls class="w-full md:w-96 rounded-lg bg-black"></video>
               } @else {
                 <audio [src]="audioUrl" controls class="w-full md:w-64"></audio>
               }
               
               <!-- Actions -->
               <div class="flex gap-2">
                 <button (click)="downloadMedia()" class="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50" title="Download Recording">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                 </button>
                 <button (click)="exportJson()" class="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50" title="Export JSON">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                 </button>
                 <button (click)="deleteMeeting()" class="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-red-600 bg-white hover:bg-red-50" title="Delete Meeting">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                 </button>
               </div>
            </div>
          </div>
        </div>

        <!-- Main Workspace -->
        <div class="flex-1 flex flex-col md:flex-row gap-6 min-h-[600px]">
          
          <!-- Left: Tabs -->
          <div class="w-full md:w-2/3 bg-white shadow sm:rounded-lg flex flex-col overflow-hidden">
            <div class="border-b border-gray-200">
              <nav class="-mb-px flex" aria-label="Tabs">
                @for (tab of tabs; track tab) {
                  <button
                    (click)="activeTab.set(tab)"
                    [class.border-indigo-500]="activeTab() === tab"
                    [class.text-indigo-600]="activeTab() === tab"
                    [class.border-transparent]="activeTab() !== tab"
                    [class.text-gray-500]="activeTab() !== tab"
                    class="w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm hover:text-gray-700 hover:border-gray-300">
                    {{ tab }}
                  </button>
                }
              </nav>
            </div>
            
            <div class="flex-1 overflow-auto p-4 bg-gray-50/50">
              <!-- AI Job State Machine UI -->
              @if (currentJob(); as job) {
                @if (job.status === 'queued' || job.status === 'running') {
                  <div class="flex flex-col justify-center items-center h-full space-y-4">
                    <div class="flex flex-col items-center">
                      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                      <div class="mt-4 text-center">
                        <p class="text-sm font-bold text-gray-900 uppercase tracking-widest">{{ getStepLabel(job.step) }}...</p>
                        <p class="text-xs text-gray-500 mt-1">AI is working on your meeting insights</p>
                      </div>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="w-64 bg-gray-200 rounded-full h-2.5">
                      <div class="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" [style.width.%]="job.progress"></div>
                    </div>
                    <p class="text-[10px] text-gray-400">{{ job.progress }}% Complete</p>

                    @if (isTakingLong()) {
                      <div class="bg-amber-50 border border-amber-200 rounded-md p-3 max-w-xs text-center">
                        <p class="text-[10px] text-amber-800 font-medium">
                          Processing is taking longer than expected. This can happen for long meetings or high server load.
                        </p>
                        <div class="flex justify-center gap-3 mt-2">
                           <button (click)="retryAI()" class="text-[10px] text-indigo-600 font-bold hover:underline">Retry</button>
                           <button (click)="cancelAI()" class="text-[10px] text-red-600 font-bold hover:underline">Cancel</button>
                        </div>
                      </div>
                    }

                    <button (click)="cancelAI()" class="text-xs text-red-500 hover:text-red-700 underline mt-4">
                      Cancel Processing
                    </button>
                  </div>
                } @else if (job.status === 'failed' || job.status === 'stale') {
                  <div class="flex flex-col justify-center items-center h-full space-y-4 p-6 text-center">
                    <div class="bg-red-50 p-4 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 class="text-lg font-bold text-gray-900">Processing Failed</h3>
                    <p class="text-sm text-gray-500 max-w-xs">{{ job.errorMessage || 'An unexpected error occurred during AI processing.' }}</p>
                    
                    <div class="flex gap-3 mt-4">
                      <button (click)="retryAI()" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 shadow-sm">
                        Retry Processing
                      </button>
                      <button (click)="currentJob.set(undefined)" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">
                        Dismiss
                      </button>
                    </div>
                  </div>
                } @else if (job.status === 'canceled') {
                  <div class="flex flex-col justify-center items-center h-full space-y-4 text-center">
                    <p class="text-gray-500 italic">Processing was canceled.</p>
                    <button (click)="retryAI()" class="text-sm text-indigo-600 font-bold hover:underline">
                      Restart AI Processing
                    </button>
                  </div>
                }
              }

              <!-- Content (Only show if job is success or no job exists) -->
              @if (!currentJob() || currentJob()?.status === 'success') {
                
                <!-- TRANSCRIPT TAB -->
                @if (activeTab() === 'Transcript') {
                  <div class="space-y-6 pb-10">
                    @for (segment of parsedTranscript(); track $index) {
                      <div class="flex gap-4 group">
                        <!-- Avatar / Initials -->
                        <div class="flex-shrink-0 mt-1">
                          <div [class]="'h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ' + segment.colorClass">
                            {{ getInitials(segment.speaker) }}
                          </div>
                        </div>
                        
                        <!-- Content Bubble -->
                        <div class="flex-1 min-w-0">
                           <div class="flex items-baseline gap-2 mb-1">
                             <span class="text-sm font-bold text-gray-900">{{ segment.speaker }}</span>
                             <span class="text-xs text-gray-400 font-mono">{{ segment.timestamp }}</span>
                           </div>
                           <div class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-white p-3 rounded-lg rounded-tl-none shadow-sm border border-gray-100 group-hover:border-indigo-100 transition-colors">
                             {{ segment.text }}
                           </div>
                        </div>
                      </div>
                    }
                    @if (parsedTranscript().length === 0) {
                      <p class="text-gray-500 italic">No transcript available.</p>
                    }
                  </div>
                }
                
                <!-- SUMMARY TAB -->
                @if (activeTab() === 'Summary') {
                  <div class="bg-white p-6 rounded-lg shadow-sm">
                    @if (resolvedSummary(); as s) {
                      
                      <!-- Summary Actions -->
                      <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                         <div class="text-sm text-gray-500 italic">AI Generated Summary</div>
                         @if (!isEditingSummary()) {
                            <button (click)="toggleEditSummary()" class="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
                               <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                               Edit Summary
                            </button>
                         } @else {
                            <div class="flex gap-2">
                               <button (click)="saveSummary()" class="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 shadow-sm">Save Changes</button>
                               <button (click)="toggleEditSummary()" class="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 text-gray-700">Cancel</button>
                            </div>
                         }
                      </div>

                      @if (!isEditingSummary()) {
                         <!-- READ ONLY MODE -->
                         <div class="prose prose-sm max-w-none">
                            
                            <!-- Speaker Stats (Always Read Only) -->
                            @if (s.speakerStats && s.speakerStats.length) {
                              <div class="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 not-prose">
                                <h4 class="font-bold text-gray-700 mb-3 text-xs uppercase tracking-wider">Speaker Statistics</h4>
                                <div class="space-y-3">
                                  @for (stat of s.speakerStats; track stat.speaker) {
                                    <div>
                                      <div class="flex justify-between text-xs mb-1">
                                        <span class="font-medium">{{ stat.speaker }}</span>
                                        <span class="text-gray-500">{{ stat.style }}</span>
                                        <span class="font-bold">{{ stat.percentage }}%</span>
                                      </div>
                                      <div class="w-full bg-gray-200 rounded-full h-2">
                                        <div class="bg-indigo-600 h-2 rounded-full" [style.width.%]="stat.percentage"></div>
                                      </div>
                                    </div>
                                  }
                                </div>
                              </div>
                            }

                            <!-- Participants List -->
                            <div class="mb-6">
                               <h4 class="font-bold text-gray-900 mb-2 text-sm uppercase tracking-wider">Participants</h4>
                               <div class="flex flex-wrap gap-2">
                                  @for (speakerId of detectedSpeakers(); track speakerId) {
                                     <span [class]="'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + getSpeakerColorClass(speakerId)">
                                       {{ getDisplayName(speakerId) }}
                                     </span>
                                  }
                                  @if (detectedSpeakers().length === 0) {
                                     <span class="text-gray-500 text-sm italic">No participants detected.</span>
                                  }
                               </div>
                            </div>
                            
                            <h3 class="text-lg font-bold text-gray-900">Executive Summary</h3>
                            <p class="text-gray-700 leading-relaxed">{{ s.executiveSummary }}</p>
                            
                            @if (s.actionItems?.length) {
                                <h4 class="font-bold mt-6 text-gray-900">Action Items</h4>
                                <ul class="list-disc pl-5 space-y-1">
                                    @for (item of s.actionItems; track item) { <li class="text-gray-700">{{ item }}</li> }
                                </ul>
                            }

                            @if (s.keyDecisions?.length) {
                                <h4 class="font-bold mt-6 text-gray-900">Key Decisions</h4>
                                <ul class="list-disc pl-5 space-y-1">
                                    @for (d of s.keyDecisions; track d) { <li class="text-gray-700">{{ d }}</li> }
                                </ul>
                            }
                         </div>
                      } @else {
                         <!-- EDIT MODE (Uses original meeting summary to avoid double replacement) -->
                         @if (meeting()?.summary; as originalSummary) {
                           <div class="space-y-8">
                              <!-- Executive Summary Edit -->
                              <div>
                                  <label class="block text-sm font-bold text-gray-700 mb-2">Executive Summary</label>
                                  <textarea 
                                    [(ngModel)]="originalSummary.executiveSummary" 
                                    rows="6" 
                                    class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-3 border leading-relaxed"
                                  ></textarea>
                              </div>

                              <!-- Action Items Edit -->
                              <div>
                                  <div class="flex justify-between items-center mb-3">
                                     <label class="block text-sm font-bold text-gray-700">Action Items</label>
                                     <button (click)="addSummaryItem('actionItems')" class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 flex items-center">
                                       <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                                       Add Item
                                     </button>
                                  </div>
                                  <div class="space-y-3">
                                     @for (item of originalSummary.actionItems; track $index) {
                                        <div class="flex gap-2 items-start">
                                           <span class="text-gray-400 mt-2">•</span>
                                           <textarea 
                                             [ngModel]="item" 
                                             (ngModelChange)="originalSummary.actionItems[$index] = $event"
                                             rows="1"
                                             class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2 resize-y"
                                           ></textarea>
                                           <button (click)="removeSummaryItem('actionItems', $index)" class="mt-1 text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors">
                                             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                             </svg>
                                           </button>
                                        </div>
                                     }
                                  </div>
                              </div>

                              <!-- Key Decisions Edit -->
                              <div>
                                  <div class="flex justify-between items-center mb-3">
                                     <label class="block text-sm font-bold text-gray-700">Key Decisions</label>
                                     <button (click)="addSummaryItem('keyDecisions')" class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 flex items-center">
                                       <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                                       Add Decision
                                     </button>
                                  </div>
                                  <div class="space-y-3">
                                     @for (item of originalSummary.keyDecisions; track $index) {
                                        <div class="flex gap-2 items-start">
                                           <span class="text-gray-400 mt-2">✓</span>
                                           <textarea 
                                             [ngModel]="item" 
                                             (ngModelChange)="originalSummary.keyDecisions[$index] = $event"
                                             rows="1"
                                             class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2 resize-y"
                                           ></textarea>
                                           <button (click)="removeSummaryItem('keyDecisions', $index)" class="mt-1 text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors">
                                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                             </svg>
                                           </button>
                                        </div>
                                     }
                                  </div>
                              </div>
                           </div>
                         }
                      }
                    }
                  </div>
                }

                @if (activeTab() === 'Tickets') {
                  <div class="space-y-4">
                     <!-- Toolbar -->
                     <div class="bg-gray-50 p-3 rounded-md border border-gray-200 flex items-center justify-between">
                       <h3 class="text-sm font-bold text-gray-700">Ticket Workspace</h3>
                       <div class="flex items-center gap-2">
                         <button (click)="saveTicketChanges()" class="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 ml-2 font-medium">
                           Save All Changes
                         </button>
                       </div>
                     </div>

                     <div class="flex flex-col md:flex-row gap-6 h-[500px]">
                        
                        <!-- COLUMN 1: INBOX / UNASSIGNED -->
                        <div class="w-full md:w-1/3 flex flex-col bg-gray-100 rounded-lg border border-gray-200">
                           <div class="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
                              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">New / Unassigned</h4>
                              <span class="bg-white text-gray-600 text-[10px] px-2 py-0.5 rounded-full border border-gray-200">{{ unassignedTickets().length }}</span>
                           </div>
                           <div class="flex-1 overflow-y-auto p-3 space-y-3" 
                                (dragover)="onDragOver($event)" 
                                (drop)="onDrop($event, undefined)">
                              @for (t of unassignedTickets(); track t.id) {
                                 <div 
                                    draggable="true" 
                                    (dragstart)="onDragStart($event, t)"
                                    class="bg-white p-3 rounded shadow-sm border border-gray-200 cursor-move hover:shadow-md hover:border-indigo-300 transition-all group relative">
                                    <div class="flex justify-between items-start mb-2">
                                       <span [class]="'text-[10px] font-bold px-1.5 py-0.5 rounded ' + getTicketTypeColor(t.type)">{{ t.type }}</span>
                                       <div class="flex items-center gap-1">
                                          <span class="text-[10px] font-mono text-gray-400">{{ t.priority }}</span>
                                          <button (click)="editTicket(t)" class="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-gray-100" title="Edit Ticket">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                               <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                          </button>
                                       </div>
                                    </div>
                                    <p class="text-sm font-medium text-gray-800 mb-1 leading-tight">{{ t.title }}</p>
                                    <p class="text-xs text-gray-500 line-clamp-2">{{ t.description }}</p>
                                 </div>
                              }
                              @if (unassignedTickets().length === 0) {
                                 <div class="text-center py-10 text-gray-400 text-xs italic">No unassigned tickets.</div>
                              }
                           </div>
                        </div>

                        <!-- COLUMN 2: STRUCTURE TREE -->
                        <div class="w-full md:w-2/3 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm">
                           <div class="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
                              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Project Structure (Epics & Stories)</h4>
                              <div class="flex items-center gap-2">
                                 <label class="text-[10px] text-gray-400 font-semibold uppercase">Context:</label>
                                 <select 
                                    [ngModel]="viewedProjectId()" 
                                    (ngModelChange)="onViewProjectChange($event)"
                                    class="text-xs border-gray-300 rounded shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1 bg-white">
                                    <option [ngValue]="undefined">Select Project...</option>
                                    @for (p of availableProjects(); track p.id) {
                                        <option [value]="p.id">{{ p.name }}</option>
                                    }
                                 </select>
                                 <button (click)="createNewEpic()" class="ml-2 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 font-medium">
                                    + New Epic
                                 </button>
                              </div>
                           </div>
                           <div class="flex-1 overflow-y-auto p-4 space-y-4">
                              
                              @if (combinedEpics().length === 0) {
                                  <div class="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center">
                                      <p class="text-gray-500 text-sm">No Epics found.</p>
                                      <p class="text-xs text-gray-400 mt-1">Create an Epic ticket in the inbox to start a tree or click below.</p>
                                      <button (click)="createNewEpic()" class="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">
                                         Create New Epic
                                      </button>
                                  </div>
                              }

                              @for (epic of combinedEpics(); track epic.id) {
                                 <div class="border border-gray-200 rounded-lg overflow-hidden">
                                    <!-- Epic Header (Drop Zone) -->
                                    <div 
                                       class="bg-slate-50 p-3 flex items-center gap-3 border-b border-gray-100 group/epic"
                                       (dragover)="onDragOver($event)" 
                                       (drop)="onDrop($event, epic.id)">
                                       <div class="bg-purple-100 text-purple-700 p-1 rounded">
                                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
                                       </div>
                                       <div class="flex-1 min-w-0">
                                          <div class="flex items-center gap-2">
                                             <h5 class="text-sm font-bold text-gray-900 truncate">{{ epic.title }}</h5>
                                             @if (epic.projectId && epic.projectId !== meeting()?.id && !isLocalTicket(epic)) {
                                                <span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Existing Project Epic</span>
                                             }
                                          </div>
                                          <p class="text-xs text-gray-500 truncate">{{ epic.description }}</p>
                                       </div>
                                       
                                       <!-- Epic Actions -->
                                       <div class="opacity-0 group-hover/epic:opacity-100 transition-opacity">
                                           <button (click)="editTicket(epic)" class="text-gray-400 hover:text-indigo-600 p-1" title="Edit Epic">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                           </button>
                                       </div>
                                    </div>
                                    
                                    <!-- Children Container -->
                                    <div class="bg-white p-2 pl-8 space-y-2 min-h-[40px]">
                                        @for (child of getChildren(epic.id); track child.id) {
                                           <div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group">
                                              <span [class]="'w-2 h-2 rounded-full ' + getTicketDotColor(child.type)"></span>
                                              <div class="flex-1 min-w-0">
                                                  <div class="flex items-center justify-between">
                                                      <span class="text-sm text-gray-700 font-medium truncate">{{ child.title }}</span>
                                                      <span class="text-[10px] text-gray-400 group-hover:text-gray-500">{{ child.type }}</span>
                                                  </div>
                                              </div>
                                              
                                              <!-- Child Actions -->
                                              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button (click)="editTicket(child)" class="text-gray-300 hover:text-indigo-600" title="Edit Ticket">
                                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                  </button>
                                                  <button (click)="child.epicId = undefined" class="text-gray-300 hover:text-red-500" title="Remove from Epic">
                                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                                                  </button>
                                              </div>
                                           </div>
                                        }
                                        @if (getChildren(epic.id).length === 0) {
                                            <p class="text-xs text-gray-300 italic pl-2">Drag tickets here...</p>
                                        }
                                    </div>
                                 </div>
                              }

                           </div>
                        </div>

                     </div>
                  </div>
                }
                
                @if (activeTab() === 'Chat') {
                  <div class="flex flex-col h-full">
                    <div class="flex-1 overflow-y-auto space-y-3 mb-4 p-2 border rounded bg-gray-50">
                      @for (msg of chatMessages(); track msg) {
                        <div [class.text-right]="msg.role === 'user'">
                          <div [class.bg-indigo-100]="msg.role === 'user'" [class.bg-white]="msg.role === 'model'"
                               class="inline-block px-3 py-2 rounded-lg text-sm shadow-sm max-w-[80%]">
                            {{ msg.text }}
                          </div>
                        </div>
                      }
                    </div>
                    <div class="flex gap-2">
                       <input #chatInput (keyup.enter)="sendMessage(chatInput.value); chatInput.value = ''" 
                              type="text" class="flex-1 border rounded-md px-3 py-2 text-sm" placeholder="Ask about the meeting...">
                       <button (click)="sendMessage(chatInput.value); chatInput.value = ''"
                               class="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm">Send</button>
                    </div>
                  </div>
                }
              }
            </div>
          </div>

          <!-- Right: Info Panel & Speaker Management -->
          <div class="w-full md:w-1/3 space-y-4">
             
             <!-- Details Panel -->
             <div class="bg-white shadow sm:rounded-lg p-6">
               <h3 class="font-bold text-gray-800 mb-4 text-lg">Meeting Details</h3>
               
               <!-- Project Assignment (Multi-Select) -->
               <div class="mb-4">
                  <div class="flex justify-between items-center mb-1">
                    <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Projects</label>
                    @if (projectSaved()) { <span class="text-xs text-green-600 font-bold transition-opacity duration-500">Saved</span> }
                  </div>
                  
                  <div class="flex flex-wrap gap-2 mb-2">
                      @for (pid of getCurrentProjectIds(); track pid) {
                          <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800">
                             {{ getProjectName(pid) }}
                             <button (click)="removeProject(pid)" class="ml-1.5 text-indigo-500 hover:text-indigo-900 focus:outline-none">
                                <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                   <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                             </button>
                          </span>
                      }
                      @if (getCurrentProjectIds().length === 0) {
                          <span class="text-xs text-gray-400 italic py-1">No projects assigned.</span>
                      }
                  </div>

                  <select 
                    (change)="addProject($event)"
                    class="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    <option value="" disabled selected>+ Add Project...</option>
                    @for (p of availableProjects(); track p.id) {
                      <option [value]="p.id" [disabled]="hasProject(p.id)">{{ p.name }}</option>
                    }
                    <option disabled>──────────</option>
                    <option value="CREATE_NEW">+ Create New Project...</option>
                  </select>

                  <!-- Inline Project Creation Form -->
                  @if (showNewProjectForm()) {
                    <div class="mt-3 p-3 border border-indigo-100 bg-indigo-50/30 rounded-md space-y-2">
                       <p class="text-xs font-bold text-indigo-700">Create New Project</p>
                       <input 
                         [(ngModel)]="newProjectName" 
                         type="text" 
                         placeholder="Project Name (required)"
                         class="block w-full text-xs border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                       >
                       <textarea 
                         [(ngModel)]="newProjectDescription" 
                         placeholder="Description (optional)"
                         rows="2"
                         class="block w-full text-xs border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                       ></textarea>
                       
                       @if (projectCreationError()) {
                         <p class="text-[10px] text-red-500">{{ projectCreationError() }}</p>
                       }

                       <div class="flex justify-end gap-2 pt-1">
                          <button 
                            (click)="showNewProjectForm.set(false)"
                            class="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700">
                            Cancel
                          </button>
                          <button 
                            (click)="submitNewProject()"
                            [disabled]="!newProjectName().trim() || isCreatingProject()"
                            class="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
                            {{ isCreatingProject() ? 'Creating...' : 'Create & Assign' }}
                          </button>
                       </div>
                    </div>
                  }
               </div>

                <!-- Participants / Speakers (Mapping) -->
                <div class="mb-6">
                  <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Participants (Speakers)</h4>
                  <div class="space-y-2">
                     @for (speaker of detectedSpeakers(); track speaker) {
                       <div class="flex flex-col gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                         <div class="flex items-center justify-between gap-2">
                           <div class="flex items-center gap-2 overflow-hidden">
                             <div [class]="'w-2 h-2 rounded-full flex-shrink-0 ' + getSpeakerColorClass(speaker).split(' ')[0]"></div>
                             <span class="text-xs font-bold text-gray-700 truncate" [title]="speaker">{{ speaker }}</span>
                           </div>
                           
                           <div class="flex items-center gap-2">
                             <select 
                               [value]="getMappedUserId(speaker) || 'null'" 
                               (change)="onSpeakerMappingChange(speaker, $event)"
                               class="text-[10px] border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-1 pl-2 pr-8 bg-white">
                               <option value="null">Unassigned</option>
                               @for (u of availableUsers(); track u.id) {
                                 <option [value]="u.id">{{ u.name }}</option>
                               }
                               <option disabled>──────────</option>
                               <option value="CREATE_NEW">+ Create New User...</option>
                             </select>
                             
                             @if (getMappedUserId(speaker)) {
                               <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-100 text-green-800">
                                 Linked
                               </span>
                             }
                           </div>
                         </div>
                         
                         @if (showNewUserForm() === speaker) {
                            <div class="mt-1 p-3 border border-indigo-100 bg-indigo-50/30 rounded-md space-y-2">
                               <p class="text-xs font-bold text-indigo-700">Create New User</p>
                               <input 
                                 [(ngModel)]="newUserName" 
                                 type="text" 
                                 placeholder="Name (required)"
                                 class="block w-full text-xs border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                               >
                               <input 
                                 [(ngModel)]="newUserEmail" 
                                 type="email" 
                                 placeholder="Email (optional)"
                                 class="block w-full text-xs border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                               >
                               
                               @if (userCreationError()) {
                                 <p class="text-[10px] text-red-500">{{ userCreationError() }}</p>
                               }

                               <div class="flex justify-end gap-2 pt-1">
                                  <button 
                                    (click)="showNewUserForm.set(null)"
                                    class="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700">
                                    Cancel
                                  </button>
                                  <button 
                                    (click)="submitNewUser(speaker)"
                                    [disabled]="!newUserName.trim() || isCreatingUser()"
                                    class="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
                                    {{ isCreatingUser() ? 'Creating...' : 'Create & Link' }}
                                  </button>
                               </div>
                            </div>
                         }
                       </div>
                     }
                     @if (detectedSpeakers().length === 0) {
                       <span class="text-sm text-gray-500 italic">No speakers detected yet.</span>
                     }
                  </div>
                  <p class="text-[10px] text-gray-400 mt-2">Map detected speaker labels to real users to update the transcript and summary.</p>
                </div>

               <!-- Metadata -->
               <div class="text-sm space-y-3 pt-4 border-t border-gray-100">
                 <div>
                   <span class="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</span>
                   <div class="mt-1 flex flex-wrap gap-2">
                      @for (tag of meeting()?.tags; track tag) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{{ tag }}</span>
                      }
                      @if (!meeting()?.tags?.length) { <span class="text-gray-400 italic">No tags</span> }
                   </div>
                 </div>
                 
                 <button (click)="regenerateAI()" class="w-full mt-6 flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                   </svg>
                   Regenerate AI Insights
                 </button>
               </div>
             </div>

          </div>
        </div>
      </div>
    } @else {
      <div class="p-10 text-center">Loading Meeting...</div>
    }

    <!-- Ticket Edit Modal -->
    @if (showTicketModal()) {
      <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" (click)="closeModal()"></div>
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
                {{ tempTicket.id ? 'Edit Ticket' : 'Create New Epic' }}
              </h3>
              
              <div class="space-y-4">
                <!-- Title -->
                <div>
                   <label class="block text-sm font-medium text-gray-700">Title</label>
                   <input type="text" [(ngModel)]="tempTicket.title" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                </div>

                <div class="grid grid-cols-2 gap-4">
                   <!-- Type -->
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Type</label>
                      <select [(ngModel)]="tempTicket.type" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                         <option value="Epic">Epic</option>
                         <option value="User Story">User Story</option>
                         <option value="Task">Task</option>
                         <option value="Bug">Bug</option>
                         <option value="Improvement">Improvement</option>
                         <option value="Requirement">Requirement</option>
                      </select>
                   </div>
                   
                   <!-- Priority -->
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Priority</label>
                      <select [(ngModel)]="tempTicket.priority" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                         <option value="P0">P0 (Critical)</option>
                         <option value="P1">P1 (High)</option>
                         <option value="P2">P2 (Medium)</option>
                         <option value="P3">P3 (Low)</option>
                      </select>
                   </div>
                </div>

                <!-- Project Context -->
                <div>
                   <label class="block text-sm font-medium text-gray-700">Assigned Project</label>
                   <select [(ngModel)]="tempTicket.projectId" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                      <option [ngValue]="undefined">Unassigned (Local to Meeting)</option>
                      @for (p of availableProjects(); track p.id) {
                         <option [value]="p.id">{{ p.name }}</option>
                      }
                   </select>
                </div>

                <!-- Description -->
                <div>
                   <label class="block text-sm font-medium text-gray-700">Description</label>
                   <textarea [(ngModel)]="tempTicket.description" rows="4" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"></textarea>
                </div>
              </div>

            </div>
            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button (click)="saveTempTicket()" [disabled]="!tempTicket.title" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none disabled:bg-gray-400 sm:ml-3 sm:w-auto sm:text-sm">
                Save
              </button>
              <button (click)="closeModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class MeetingComponent implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  db = inject(DbService);
  ai = inject(AiService);
  sanitizer = inject(DomSanitizer);

  meeting = signal<Meeting | undefined>(undefined);
  currentJob = signal<AIJob | undefined>(undefined);
  tickets = signal<Ticket[]>([]); 
  projectEpics = signal<Ticket[]>([]); // Epics from other meetings in the project
  
  availableProjects = signal<Project[]>([]);
  availableUsers = signal<User[]>([]);
  speakerMappings = signal<MeetingSpeakerMap[]>([]);
  
  viewedProjectId = signal<string | undefined>(undefined);
  
  // Project Creation
  showNewProjectForm = signal(false);
  newProjectName = signal('');
  newProjectDescription = signal('');
  isCreatingProject = signal(false);
  projectCreationError = signal<string | null>(null);

  showNewUserForm = signal<string | null>(null);
  newUserName = '';
  newUserEmail = '';
  isCreatingUser = signal<boolean>(false);
  userCreationError = signal<string | null>(null);

  isTakingLong = computed(() => {
      const job = this.currentJob();
      if (!job || job.status !== 'running') return false;
      const started = new Date(job.startedAt).getTime();
      const elapsed = Date.now() - started;
      return elapsed > 3 * 60 * 1000; // 3 minutes
  });

  isEditingSummary = signal(false);
  audioUrl: SafeUrl | undefined;
  rawAudioBlob: Blob | undefined;
  
  tabs = ['Transcript', 'Summary', 'Tickets', 'Chat'];
  activeTab = signal('Transcript');
  
  // Polling & Timeout
  private pollInterval: any;
  private hardTimeoutTimer: any;
  private pollCount = 0;
  private readonly HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  chatMessages = signal<{role: 'user'|'model', text: string}[]>([]);
  chatSession: any[] = [];
  
  editingSpeaker = signal<string | null>(null);
  projectSaved = signal(false);

  scrumTypes = ['Epic', 'User Story', 'Task', 'Bug', 'Improvement'];

  // Modal State
  showTicketModal = signal(false);
  tempTicket: Ticket = this.createEmptyTicket();

  private colorPalette = [
    'bg-red-100 text-red-800', 
    'bg-blue-100 text-blue-800', 
    'bg-green-100 text-green-800', 
    'bg-yellow-100 text-yellow-800', 
    'bg-purple-100 text-purple-800', 
    'bg-pink-100 text-pink-800',
    'bg-indigo-100 text-indigo-800',
    'bg-orange-100 text-orange-800'
  ];

  parsedTranscript = computed(() => {
    const text = this.meeting()?.transcript;
    const mappings = this.speakerMappings();
    if (!text) return [];
    const segments: TranscriptSegment[] = [];
    const lines = text.split('\n');
    const regex = /^(\[\d{1,2}:\d{2}\])\s*(.+?):\s*(.*)$/;
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const speaker = match[2].trim();
        const mapping = mappings.find(m => m.speakerId === speaker);
        const displayName = mapping?.userDisplayName || speaker;
        segments.push({
          timestamp: match[1],
          speaker: displayName,
          originalSpeaker: speaker,
          text: match[3],
          colorClass: this.getSpeakerColorClass(speaker)
        });
      } else if (segments.length > 0 && line.trim()) {
        segments[segments.length - 1].text += '\n' + line;
      }
    }
    
    // Fallback for unstructured text
    if (segments.length === 0 && text.trim().length > 0) {
        segments.push({
            timestamp: '0:00',
            speaker: 'Transcript',
            originalSpeaker: 'Transcript',
            text: text,
            colorClass: 'bg-gray-100 text-gray-800'
        });
    }
    return segments;
  });

  detectedSpeakers = computed(() => {
    const text = this.meeting()?.transcript;
    if (!text) return [];
    const speakers = new Set<string>();
    const regex = /^(\[\d{1,2}:\d{2}\])\s*(.+?):\s*(.*)$/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
        speakers.add(match[2].trim());
    }
    return Array.from(speakers).sort();
  });

  // Ticket Computeds
  unassignedTickets = computed(() => {
      // Show tickets that: 
      // 1. Are NOT Epics
      // 2. Have NO epicId set
      return this.tickets().filter(t => t.type !== 'Epic' && !t.epicId);
  });

  resolvedSummary = computed(() => {
    const m = this.meeting();
    if (!m || !m.summary) return null;
    const mappings = this.speakerMappings();
    let summary = JSON.parse(JSON.stringify(m.summary));
    
    const replaceNames = (text: string) => {
      if (!text) return text;
      let newText = text;
      mappings.forEach(map => {
        if (map.userDisplayName) {
          const escaped = map.speakerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'g');
          newText = newText.replace(regex, map.userDisplayName);
        }
      });
      return newText;
    };

    if (summary.executiveSummary) {
      summary.executiveSummary = replaceNames(summary.executiveSummary);
    }
    if (summary.actionItems) {
      summary.actionItems = summary.actionItems.map((item: string) => replaceNames(item));
    }
    if (summary.keyDecisions) {
      summary.keyDecisions = summary.keyDecisions.map((d: string) => replaceNames(d));
    }
    if (summary.speakerStats) {
      summary.speakerStats = summary.speakerStats.map((stat: any) => ({
        ...stat,
        speaker: this.getDisplayName(stat.speaker)
      }));
    }
    
    return summary;
  });

  // Epics defined locally in this meeting
  localEpics = computed(() => {
      return this.tickets().filter(t => t.type === 'Epic');
  });

  // Combine Local + Project Epics
  combinedEpics = computed(() => {
      return [...this.projectEpics(), ...this.localEpics()];
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    await this.loadDependencies();
    await this.db.checkAndMarkStaleJobs();

    if (id) {
      const m = await this.db.getMeeting(id);
      if (m) {
        this.meeting.set(m);
        
        // Load Speaker Mappings
        const mappings = await this.db.getSpeakerMappings(id);
        this.speakerMappings.set(mappings);

        if (m.tickets) {
           // Ensure every ticket has an ID for Drag/Drop
           const loadedTickets: Ticket[] = JSON.parse(JSON.stringify(m.tickets));
           loadedTickets.forEach(t => { if (!t.id) t.id = uuidv4(); });
           this.tickets.set(loadedTickets);
        }
        
        // Load Audio
        const blob = await this.db.getAudio(id);
        if (blob) {
          this.rawAudioBlob = blob;
          const url = URL.createObjectURL(blob);
          this.audioUrl = this.sanitizer.bypassSecurityTrustUrl(url);

          // Check for existing job or results
          const latestJob = await this.db.getLatestJobForMeeting(id);
          this.currentJob.set(latestJob);

          if (!m.transcript && (!latestJob || latestJob.status === 'failed' || latestJob.status === 'stale' || latestJob.status === 'canceled')) {
            this.startAIProcessing(m, blob);
          } else if (latestJob && (latestJob.status === 'queued' || latestJob.status === 'running')) {
            this.startPolling();
          }
        }
        
        // Initial Project Load Logic
        const pIds = this.getCurrentProjectIds(m);
        if (pIds.length > 0) {
            this.viewedProjectId.set(pIds[0]); // Default to first project context
            this.loadProjectEpics(pIds[0]);
        } else if (m.projectId) {
            // Legacy fallback
            this.viewedProjectId.set(m.projectId);
            this.loadProjectEpics(m.projectId);
        }
      }
    }
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  private startPolling() {
    this.stopPolling();
    this.pollCount = 0;
    
    const poll = async () => {
      if (!this.meeting()?.id) return;
      
      const job = await this.db.getLatestJobForMeeting(this.meeting()!.id);
      this.currentJob.set(job);
      
      if (!job || job.status === 'success' || job.status === 'failed' || job.status === 'canceled' || job.status === 'stale') {
        this.stopPolling();
        if (job?.status === 'success') {
          // Refresh meeting data
          const m = await this.db.getMeeting(this.meeting()!.id);
          if (m) {
            this.meeting.set(m);
            if (m.tickets) this.tickets.set(JSON.parse(JSON.stringify(m.tickets)));
          }
        }
        return;
      }

      this.pollCount++;
      let nextInterval = 2000; // 2s
      if (this.pollCount > 10) nextInterval = 5000; // 5s after 20s
      if (this.pollCount > 34) nextInterval = 10000; // 10s after ~2 mins

      this.pollInterval = setTimeout(poll, nextInterval);
    };

    this.pollInterval = setTimeout(poll, 2000);
    
    // Hard Timeout
    this.hardTimeoutTimer = setTimeout(async () => {
      if (this.currentJob()?.status === 'running' || this.currentJob()?.status === 'queued') {
        await this.db.updateAIJob(this.currentJob()!.id, {
          status: 'stale',
          errorMessage: 'AI processing is taking longer than expected (Hard Timeout).',
          finishedAt: new Date()
        });
        const job = await this.db.getAIJob(this.currentJob()!.id);
        this.currentJob.set(job);
        this.stopPolling();
      }
    }, this.HARD_TIMEOUT_MS);
  }

  private stopPolling() {
    if (this.pollInterval) clearTimeout(this.pollInterval);
    if (this.hardTimeoutTimer) clearTimeout(this.hardTimeoutTimer);
  }

  async startAIProcessing(m: Meeting, blob: Blob) {
    const job = await this.db.createAIJob(m.id);
    this.currentJob.set(job);
    this.startPolling();
    
    // In this client-side app, we run the "worker" directly
    this.runAIWorker(job.id, m, blob);
  }

  private async runAIWorker(jobId: string, m: Meeting, blob: Blob) {
    const heartbeatInterval = setInterval(() => {
        this.db.heartbeat(jobId);
    }, 15000); // 15s heartbeat

    try {
      // Step 0: Validation (Improvement 3)
      if (!blob) {
          throw new Error('Media file not accessible');
      }
      console.log(`[AI Worker] Starting job ${jobId} for meeting ${m.id}. Media source: ${m.videoUrl || m.audioUrl || 'Local Blob'}. Resolved path: ${m.id}. Storage: IndexedDB. Env: Dev.`);

      // Step 1: Preprocessing (0-20%)
      await this.db.updateAIJob(jobId, { status: 'running', step: 'preprocessing', progress: 5 });
      // Simulate some preprocessing
      await new Promise(r => setTimeout(r, 1000));
      await this.db.updateAIJob(jobId, { progress: 15 });

      // Step 2: Speech-to-text (20-70%)
      await this.db.updateAIJob(jobId, { step: 'speech-to-text', progress: 20 });
      const transcript = await this.ai.transcribeAudio(blob);
      
      // Check for cancellation
      if ((await this.db.getAIJob(jobId))?.status === 'canceled') return;

      await this.db.updateAIJob(jobId, { progress: 65 });

      // Step 3: Diarization (70-85%)
      await this.db.updateAIJob(jobId, { step: 'diarization', progress: 70 });
      m.transcript = transcript;
      const speakers = new Set<string>(m.participants || []);
      const regex = /^(\[\d{1,2}:\d{2}\])\s*(.+?):\s*(.*)$/gm;
      let match;
      while ((match = regex.exec(transcript)) !== null) {
          speakers.add(match[2].trim());
      }
      m.participants = Array.from(speakers);
      await this.db.updateMeeting(m);
      await this.db.updateAIJob(jobId, { progress: 80 });
      
      // Step 4: Formatting & Storage (85-100%)
      await this.db.updateAIJob(jobId, { step: 'formatting', progress: 85 });
      const summary = await this.ai.generateSummary(transcript);
      
      if ((await this.db.getAIJob(jobId))?.status === 'canceled') return;
      m.summary = summary;
      await this.db.updateMeeting(m);
      await this.db.updateAIJob(jobId, { progress: 90 });

      const tickets = await this.ai.extractTickets(transcript);
      tickets.forEach((t: Ticket) => t.id = uuidv4());
      
      if ((await this.db.getAIJob(jobId))?.status === 'canceled') return;
      m.tickets = tickets;
      await this.db.updateMeeting(m);

      // Finalize
      await this.db.updateAIJob(jobId, { 
        status: 'success', 
        step: 'finalize', 
        progress: 100, 
        finishedAt: new Date() 
      });
      
    } catch (e: any) {
      console.error('AI Worker error', e);
      await this.db.updateAIJob(jobId, { 
        status: 'failed', 
        errorMessage: e.message || 'Unknown error',
        finishedAt: new Date()
      });
    } finally {
        clearInterval(heartbeatInterval);
    }
  }

  async retryAI() {
    if (!this.meeting() || !this.rawAudioBlob) return;
    this.startAIProcessing(this.meeting()!, this.rawAudioBlob);
  }

  async cancelAI() {
    if (this.currentJob()) {
      await this.db.updateAIJob(this.currentJob()!.id, {
        status: 'canceled',
        finishedAt: new Date()
      });
      this.currentJob.set(await this.db.getAIJob(this.currentJob()!.id));
      this.stopPolling();
    }
  }

  async loadDependencies() {
    this.availableProjects.set(await this.db.getAllProjects());
    this.availableUsers.set(await this.db.getUsers());
  }
  
  getCurrentProjectIds(m: Meeting | undefined = this.meeting()): string[] {
      if (!m) return [];
      const ids = new Set<string>();
      if (m.projectId) ids.add(m.projectId); // Legacy
      if (m.projectIds) m.projectIds.forEach(id => ids.add(id));
      return Array.from(ids);
  }

  getProjectName(id: string): string {
      return this.availableProjects().find(p => p.id === id)?.name || 'Unknown';
  }

  hasProject(id: string): boolean {
      return this.getCurrentProjectIds().includes(id);
  }

  // --- Project Management Actions ---

  async addProject(event: Event) {
      const select = event.target as HTMLSelectElement;
      const pid = select.value;

      if (pid === 'CREATE_NEW') {
          this.showNewProjectForm.set(true);
          select.value = ""; // Reset dropdown
          return;
      }

      if (!pid || !this.meeting()) return;

      const m = this.meeting()!;
      if (!m.projectIds) m.projectIds = [];
      
      // Migrate legacy if it exists
      if (m.projectId && !m.projectIds.includes(m.projectId)) {
          m.projectIds.push(m.projectId);
      }

      if (!m.projectIds.includes(pid)) {
          m.projectIds.push(pid);
          if (!m.projectId) m.projectId = pid; // Update legacy for compatibility
      }

      await this.db.updateMeeting(m);
      this.meeting.set({...m});
      
      // Update Context View if it was empty
      if (!this.viewedProjectId()) {
          this.onViewProjectChange(pid);
      }

      select.value = ""; // Reset dropdown
      this.projectSaved.set(true);
      setTimeout(() => this.projectSaved.set(false), 2000);
  }

  async removeProject(pid: string) {
      if (!this.meeting()) return;
      const m = this.meeting()!;
      
      if (m.projectIds) {
          m.projectIds = m.projectIds.filter(id => id !== pid);
      }
      
      if (m.projectId === pid) {
          m.projectId = m.projectIds && m.projectIds.length > 0 ? m.projectIds[0] : undefined;
      }

      await this.db.updateMeeting(m);
      this.meeting.set({...m});

      // If we were viewing this project, clear context
      if (this.viewedProjectId() === pid) {
          const next = this.getCurrentProjectIds(m)[0];
          this.onViewProjectChange(next); // can be undefined
      }
  }

  async submitNewProject() {
      if (!this.newProjectName().trim()) return;
      
      this.isCreatingProject.set(true);
      this.projectCreationError.set(null);
      
      try {
          const projects = await this.db.getAllProjects();
          if (projects.some(p => p.name.toLowerCase() === this.newProjectName().trim().toLowerCase())) {
              throw new Error('A project with this name already exists.');
          }

          const newProject: Project = {
              id: crypto.randomUUID(),
              name: this.newProjectName().trim(),
              description: this.newProjectDescription().trim()
          };

          await this.db.addProject(newProject);
          
          // Auto-assign to meeting
          if (this.meeting()) {
              const m = this.meeting()!;
              if (!m.projectIds) m.projectIds = [];
              m.projectIds.push(newProject.id);
              if (!m.projectId) m.projectId = newProject.id;
              await this.db.updateMeeting(m);
              this.meeting.set({...m});
          }

          // Refresh projects list
          await this.loadDependencies();
          
          // Reset form
          this.showNewProjectForm.set(false);
          this.newProjectName.set('');
          this.newProjectDescription.set('');
          
          this.projectSaved.set(true);
          setTimeout(() => this.projectSaved.set(false), 2000);
      } catch (e: any) {
          this.projectCreationError.set(e.message || 'Failed to create project');
      } finally {
          this.isCreatingProject.set(false);
      }
  }

  // --- Ticket Context ---

  async onViewProjectChange(projectId: string | undefined) {
      this.viewedProjectId.set(projectId);
      if (projectId) {
          await this.loadProjectEpics(projectId);
      } else {
          this.projectEpics.set([]);
      }
  }
  
  async loadProjectEpics(projectId: string) {
      const allMeetings = await this.db.getAllMeetings();
      // Find all tickets from OTHER meetings in the same project that are Epics
      const epics: Ticket[] = [];
      const currentId = this.meeting()?.id;
      
      allMeetings.forEach(m => {
          // Check if meeting belongs to this project (Supports Multi-Project)
          const mProjects = new Set<string>(m.projectIds || []);
          if (m.projectId) mProjects.add(m.projectId);
          
          if (m.id !== currentId && mProjects.has(projectId) && m.tickets) {
              m.tickets.forEach(t => {
                  if (t.type === 'Epic') {
                      // Fix: Assign ID if missing (legacy data patch)
                      if(!t.id) t.id = uuidv4(); 
                      epics.push(t);
                  }
              });
          }
      });
      this.projectEpics.set(epics);
  }

  // --- DRAG AND DROP LOGIC ---

  onDragStart(event: DragEvent, ticket: Ticket) {
      if (event.dataTransfer && ticket.id) {
          event.dataTransfer.setData('text/plain', ticket.id);
          event.dataTransfer.effectAllowed = 'move';
      }
  }

  onDragOver(event: DragEvent) {
      event.preventDefault(); // Necessary to allow dropping
      if (event.dataTransfer) {
         event.dataTransfer.dropEffect = 'move';
      }
  }

  onDrop(event: DragEvent, targetEpicId: string | undefined) {
      event.preventDefault();
      const ticketId = event.dataTransfer?.getData('text/plain');
      if (!ticketId) return;

      // Find the ticket in our local state
      const ticketIndex = this.tickets().findIndex(t => t.id === ticketId);
      if (ticketIndex > -1) {
          const updated = [...this.tickets()];
          updated[ticketIndex].epicId = targetEpicId;
          
          // Auto-sync project ID if dropped into an existing Epic
          if (targetEpicId) {
             const targetEpic = this.combinedEpics().find(e => e.id === targetEpicId);
             // If the Epic belongs to a specific project, assign the ticket to it
             if (targetEpic && targetEpic.projectId) {
                 updated[ticketIndex].projectId = targetEpic.projectId;
             } else if (this.viewedProjectId()) {
                 // Fallback to currently viewed project context
                 updated[ticketIndex].projectId = this.viewedProjectId();
             }
          }
          
          this.tickets.set(updated);
      }
  }

  getChildren(epicId: string | undefined) {
      if (!epicId) return [];
      return this.tickets().filter(t => t.epicId === epicId);
  }

  isLocalTicket(t: Ticket): boolean {
      return this.tickets().some(local => local.id === t.id);
  }
  
  getTicketDotColor(type: string) {
      switch(type.toLowerCase()) {
          case 'user story': return 'bg-blue-500';
          case 'bug': return 'bg-red-500';
          case 'task': return 'bg-indigo-500';
          case 'improvement': return 'bg-green-500';
          default: return 'bg-gray-400';
      }
  }

  // --- Modal & Ticket Management ---

  createEmptyTicket(): Ticket {
    return {
      id: undefined,
      type: 'Task',
      title: '',
      description: '',
      priority: 'P2',
      projectId: this.meeting()?.projectId || this.viewedProjectId()
    };
  }

  createNewEpic() {
    this.tempTicket = {
       ...this.createEmptyTicket(),
       type: 'Epic',
       projectId: this.viewedProjectId() || (this.meeting()?.projectIds?.[0] || this.meeting()?.projectId)
    };
    this.showTicketModal.set(true);
  }

  editTicket(ticket: Ticket) {
    // Clone to temp to avoid direct mutation
    this.tempTicket = JSON.parse(JSON.stringify(ticket));
    this.showTicketModal.set(true);
  }

  closeModal() {
    this.showTicketModal.set(false);
  }

  saveTempTicket() {
    // If it's a new ticket (no ID), give it one
    if (!this.tempTicket.id) {
       this.tempTicket.id = uuidv4();
       this.tickets.update(current => [...current, this.tempTicket]);
    } else {
       // Update existing
       this.tickets.update(current => 
          current.map(t => t.id === this.tempTicket.id ? this.tempTicket : t)
       );
    }
    this.closeModal();
  }


  async deleteMeeting() {
    const m = this.meeting();
    if (!m) return;
    if (confirm(`Are you sure you want to delete "${m.title}"? This will also delete the recording and transcript.`)) {
      await this.db.deleteMeeting(m.id);
      this.router.navigate(['/dashboard']);
    }
  }

  async regenerateAI() {
    if (!this.meeting() || !this.meeting()?.transcript || !this.rawAudioBlob) return;
    this.startAIProcessing(this.meeting()!, this.rawAudioBlob);
  }

  toggleEditSummary() {
      this.isEditingSummary.update(v => !v);
  }

  async saveSummary() {
      if (this.meeting()) {
          await this.db.updateMeeting(this.meeting()!);
          this.isEditingSummary.set(false);
      }
  }

  addSummaryItem(listName: 'actionItems' | 'keyDecisions') {
      const m = this.meeting();
      if (!m || !m.summary) return;
      
      if (!m.summary[listName]) {
          m.summary[listName] = [];
      }
      m.summary[listName].push('');
      this.meeting.set({...m});
  }

  removeSummaryItem(listName: 'actionItems' | 'keyDecisions', index: number) {
      const m = this.meeting();
      if (!m || !m.summary || !m.summary[listName]) return;
      m.summary[listName].splice(index, 1);
      this.meeting.set({...m});
  }

  startEditingSpeaker(speaker: string) {
    this.editingSpeaker.set(speaker);
  }

  async renameSpeaker(oldName: string, newName: string) {
    this.editingSpeaker.set(null); 

    if (!newName.trim() || oldName === newName) return;
    newName = newName.trim();
    
    const m = this.meeting();
    if (!m || !m.transcript) return;

    const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    const regex = new RegExp(`((?:^|\\n)(?:\\[\\d{1,2}:\\d{2}\\]\\s*)?)(${escapedOld})(:)`, 'gm');
    
    let updatedTranscript = m.transcript.replace(regex, `$1${newName}$3`);
    m.transcript = updatedTranscript;

    if (m.summary && m.summary.speakerStats) {
      m.summary.speakerStats = m.summary.speakerStats.map((stat: any) => {
        if (stat.speaker === oldName) return { ...stat, speaker: newName };
        return stat;
      });
    }

    const users = await this.db.getUsers();
    if (!users.find(u => u.name.toLowerCase() === newName.toLowerCase())) {
       await this.db.addUser({
         id: uuidv4(),
         name: newName
       });
       await this.loadDependencies(); 
    }

    if (!m.participants.includes(newName)) {
      m.participants.push(newName);
    }
    m.participants = m.participants.filter(p => p !== oldName);

    await this.db.updateMeeting(m);
    this.meeting.set({...m});
  }

  getMappedUserId(speakerId: string): string | null {
    const mapping = this.speakerMappings().find(m => m.speakerId === speakerId);
    return mapping ? mapping.userId : null;
  }

  getDisplayName(speakerId: string): string {
    const mapping = this.speakerMappings().find(m => m.speakerId === speakerId);
    return mapping?.userDisplayName || speakerId;
  }

  async onSpeakerMappingChange(speakerId: string, event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    
    if (value === 'CREATE_NEW') {
      this.showNewUserForm.set(speakerId);
      this.newUserName = speakerId;
      this.newUserEmail = '';
      this.userCreationError.set(null);
      select.value = this.getMappedUserId(speakerId) || 'null';
      return;
    }
    
    const userId = value === 'null' ? null : value;
    await this.mapSpeakerToUser(speakerId, userId);
  }

  async submitNewUser(speakerId: string) {
    const name = this.newUserName.trim();
    const email = this.newUserEmail.trim();
    if (!name) return;

    this.isCreatingUser.set(true);
    this.userCreationError.set(null);

    try {
      const users = await this.db.getUsers();
      
      if (email) {
        const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (existingUser) {
          this.userCreationError.set(`User with email ${email} already exists. Please select them from the dropdown.`);
          this.isCreatingUser.set(false);
          return;
        }
      }

      const newUser: User = {
        id: uuidv4(),
        name,
        email: email || undefined,
        role: 'Participant'
      };

      await this.db.addUser(newUser);
      
      const updatedUsers = await this.db.getUsers();
      this.availableUsers.set(updatedUsers);

      await this.mapSpeakerToUser(speakerId, newUser.id);

      this.showNewUserForm.set(null);
    } catch (e) {
      console.error('Failed to create user', e);
      this.userCreationError.set('Failed to create user.');
    } finally {
      this.isCreatingUser.set(false);
    }
  }

  async mapSpeakerToUser(speakerId: string, userId: string | null) {
    const meetingId = this.meeting()?.id;
    if (!meetingId) return;

    const user = this.availableUsers().find(u => u.id === userId);
    const mapping: MeetingSpeakerMap = {
      id: `${meetingId}_${speakerId}`,
      meetingId,
      speakerId,
      speakerDisplay: speakerId,
      userId: userId,
      userDisplayName: user ? user.name : null,
      updatedAt: new Date()
    };

    // Optimistic Update
    this.speakerMappings.update(current => {
      const filtered = current.filter(m => m.speakerId !== speakerId);
      return [...filtered, mapping];
    });

    try {
      await this.db.saveSpeakerMapping(mapping);
    } catch (e) {
      console.error('Failed to save mapping', e);
      alert('Failed to save speaker mapping.');
      // Refresh from DB
      const fresh = await this.db.getSpeakerMappings(meetingId);
      this.speakerMappings.set(fresh);
    }
  }

  getSpeakerColorClass(speaker: string): string {
    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % this.colorPalette.length;
    return this.colorPalette[index];
  }

  getTicketTypeColor(type: string): string {
    switch (type?.toLowerCase()) {
      case 'bug': return 'text-red-700 bg-red-50 border-red-200';
      case 'user story':
      case 'feature':
      case 'requirement': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'task': return 'text-indigo-700 bg-indigo-50 border-indigo-200';
      case 'epic': return 'text-purple-700 bg-purple-50 border-purple-200';
      case 'improvement': return 'text-green-700 bg-green-50 border-green-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  async saveTicketChanges() {
    if (!this.meeting()) return;
    const m = this.meeting()!;
    m.tickets = this.tickets(); 
    await this.db.updateMeeting(m);
    this.meeting.set({...m});
    alert('Tickets saved successfully.');
  }

  async assignMeetingProject(projectId: string | undefined) {
    if (!this.meeting()) return;
    const m = this.meeting()!;
    m.projectId = projectId;
    await this.db.updateMeeting(m);
    this.meeting.set({...m});
    
    // Refresh context if project changed
    if (projectId) {
        this.viewedProjectId.set(projectId);
        this.loadProjectEpics(projectId);
    } else {
        this.projectEpics.set([]);
        this.viewedProjectId.set(undefined);
    }

    this.projectSaved.set(true);
    setTimeout(() => this.projectSaved.set(false), 2000);
  }

  async sendMessage(msg: string) {
    if (!msg.trim() || !this.meeting()?.transcript) return;
    this.chatMessages.update(history => [...history, {role: 'user', text: msg}]);
    try {
      const response = await this.ai.chat(
        this.chatSession, 
        msg, 
        this.meeting()!.transcript!
      );
      this.chatSession.push({ role: 'user', parts: [{ text: msg }] });
      this.chatSession.push({ role: 'model', parts: [{ text: response }] });
      this.chatMessages.update(history => [...history, {role: 'model', text: response}]);
    } catch (e: any) {
       console.error('Chat error', e);
       this.chatMessages.update(history => [...history, {role: 'model', text: `Error: ${e.message}`}]);
    }
  }

  getStepLabel(step: string): string {
    switch(step) {
      case 'preprocessing': return 'Preparing media';
      case 'speech-to-text': return 'Transcribing audio';
      case 'diarization': return 'Identifying speakers';
      case 'formatting': return 'Generating insights';
      case 'transcribe': return 'Transcribing';
      case 'summarize': return 'Summarizing';
      case 'tickets': return 'Extracting tickets';
      case 'finalize': return 'Finalizing';
      default: return step.charAt(0).toUpperCase() + step.slice(1);
    }
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  downloadMedia() {
    if (this.rawAudioBlob && this.meeting()) {
      const url = window.URL.createObjectURL(this.rawAudioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${this.meeting()?.id}.webm`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      alert('File not found.');
    }
  }

  exportJson() {
    if (this.meeting()) {
       const data = JSON.stringify(this.meeting(), null, 2);
       const blob = new Blob([data], { type: 'application/json' });
       const url = window.URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `meeting-${this.meeting()?.id}.json`;
       a.click();
       window.URL.revokeObjectURL(url);
    }
  }
}
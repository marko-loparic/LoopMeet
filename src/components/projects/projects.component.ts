import { Component, OnInit, inject, signal, ElementRef, ViewChild, effect, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DbService, Project, Meeting, EmailActivity, Ticket, Message } from '../../services/db.service';
import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3';

interface TimelineNode {
  id: string;
  type: 'meeting' | 'email' | 'ticket' | 'message';
  subType?: string; // for tickets
  title: string;
  startDate: Date;
  endDate?: Date;
  laneId: string;
  raw: any;
}

interface TimelineLane {
  id: string;
  label: string;
  projectId: string;
  type: 'sub-lane' | 'scrum-header' | 'ticket-lane' | 'project-header';
  isExpanded?: boolean;
  indent?: number;
  ticketId?: string; 
  ticketRaw?: EnhancedTicket;
  height: number;
  y: number;
}

interface EnhancedTicket extends Ticket {
    meetingId: string;
    internalId: string; // for tracking unique ID in UI
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-[95%] mx-auto space-y-6 h-full flex flex-col">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Projects & Timeline</h1>
        <button (click)="openTicketModal()" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
           + Add Ticket
        </button>
      </div>

      <div class="flex flex-col gap-6">
        <!-- Main Timeline Visualization -->
        <div class="bg-white shadow sm:rounded-lg p-6 overflow-hidden relative flex flex-col">
            <div class="flex justify-between items-center mb-4 flex-wrap gap-4">
                <div class="flex items-center gap-4">
                <h3 class="text-lg font-medium leading-6 text-gray-900">Activity Map</h3>
                
                <!-- Zoom Control -->
                <div class="flex items-center gap-2 bg-white border border-gray-300 rounded-full px-3 py-1 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                    </svg>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="4" 
                        step="0.1" 
                        [value]="zoomLevel()" 
                        (input)="onZoomChange($event)"
                        class="w-32 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        title="Zoom Timeline"
                    >
                    <span class="text-xs text-gray-400 w-8 text-right">{{ (zoomLevel() * 100) | number:'1.0-0' }}%</span>
                </div>
                </div>

                <div class="flex flex-wrap gap-3 text-xs">
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-indigo-600 border border-white shadow-sm"></span> Meeting</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-orange-500 border border-white shadow-sm"></span> Email</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3" style="clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background-color: #14b8a6;"></span> Message</span>
                <span class="flex items-center gap-1 pl-2 border-l border-gray-300 font-semibold">Gantt:</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-purple-500"></span> Epic</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-500"></span> Story</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500"></span> Task/Bug</span>
                </div>
            </div>
            
            <p class="text-xs text-gray-500 mb-2 italic">
               💡 Tip: Use zoom to scale time. The left sidebar stays fixed while you scroll. Click [+] to add items manually.
            </p>

            <div #timelineWrapper class="relative w-full border border-gray-100 rounded-lg bg-gray-50/50 flex-1 min-h-[600px] overflow-hidden">
                <div #timelineContainer class="w-full h-full overflow-auto"></div>
            </div>
        </div>
      </div>

      <!-- Actions Grid (Forms) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div class="bg-white shadow sm:rounded-lg p-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900">Create New Project</h3>
            <div class="mt-4 flex flex-col gap-3">
            <input type="text" [(ngModel)]="newProjectName" placeholder="Project Name" class="rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border">
            <input type="text" [(ngModel)]="newProjectDesc" placeholder="Description" class="rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border">
            <button (click)="addProject()" [disabled]="!newProjectName.trim()" class="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">Add Project</button>
            </div>
        </div>
      </div>

      <!-- Add Ticket Modal -->
      @if (showTicketModal()) {
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" (click)="closeTicketModal()"></div>
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Ticket</h3>
                
                <div class="grid grid-cols-1 gap-4">
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Project</label>
                      <select [(ngModel)]="newTicket.projectId" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                         @for (p of projects(); track p.id) {
                           <option [value]="p.id">{{ p.name }}</option>
                         }
                      </select>
                   </div>
                   
                   <div class="grid grid-cols-2 gap-4">
                     <div>
                        <label class="block text-sm font-medium text-gray-700">Type</label>
                        <select [(ngModel)]="newTicket.type" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                           <option value="Epic">Epic</option>
                           <option value="User Story">User Story</option>
                           <option value="Task">Task</option>
                           <option value="Bug">Bug</option>
                           <option value="Improvement">Improvement</option>
                        </select>
                     </div>
                     <div>
                        <label class="block text-sm font-medium text-gray-700">Priority</label>
                        <select [(ngModel)]="newTicket.priority" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                           <option value="P0">P0 (Critical)</option>
                           <option value="P1">P1 (High)</option>
                           <option value="P2">P2 (Medium)</option>
                           <option value="P3">P3 (Low)</option>
                        </select>
                     </div>
                   </div>

                   <div>
                      <label class="block text-sm font-medium text-gray-700">Title</label>
                      <input type="text" [(ngModel)]="newTicket.title" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                   </div>
                   
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Description</label>
                      <textarea [(ngModel)]="newTicket.description" rows="3" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"></textarea>
                   </div>

                   <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700">Start Date</label>
                        <input type="date" [(ngModel)]="newTicket.startDate" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700">End Date</label>
                        <input type="date" [(ngModel)]="newTicket.endDate" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                      </div>
                   </div>
                </div>

              </div>
              <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button (click)="saveNewTicket()" [disabled]="!newTicket.title || !newTicket.projectId" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none disabled:bg-gray-400 sm:ml-3 sm:w-auto sm:text-sm">
                  Save Ticket
                </button>
                <button (click)="closeTicketModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Add Message Modal -->
      @if (showMessageModal()) {
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" (click)="closeMessageModal()"></div>
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Message</h3>
                
                <div class="grid grid-cols-1 gap-4">
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Project</label>
                      <select [(ngModel)]="newMessageProjectId" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                         @for (p of projects(); track p.id) {
                           <option [value]="p.id">{{ p.name }}</option>
                         }
                      </select>
                   </div>
                   
                   <div>
                      <label class="block text-sm font-medium text-gray-700">Date</label>
                      <input type="datetime-local" [(ngModel)]="newMessageDate" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                   </div>

                   <div>
                      <label class="block text-sm font-medium text-gray-700">Content</label>
                      <textarea [(ngModel)]="newMessageContent" rows="5" placeholder="Paste your message here..." class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"></textarea>
                   </div>
                </div>

              </div>
              <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button (click)="saveNewMessage()" [disabled]="!newMessageContent || !newMessageProjectId" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none disabled:bg-gray-400 sm:ml-3 sm:w-auto sm:text-sm">
                  Save Message
                </button>
                <button (click)="closeMessageModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Email View Modal -->
      @if (viewingEmail()) {
        <div class="fixed inset-0 z-50 overflow-y-auto">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75" (click)="closeEmailModal()"></div>
          <div class="flex items-center justify-center min-h-screen px-4 pb-20 pt-4">
             <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
                <button (click)="closeEmailModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-500">
                    <span class="sr-only">Close</span>
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <h3 class="text-lg font-medium text-gray-900 pr-8">{{ viewingEmail()?.subject }}</h3>
                <p class="text-sm text-gray-500 mt-2">{{ viewingEmail()?.sender }}</p>
                <div class="mt-4 bg-gray-50 p-4 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto border border-gray-200">
                    {{ viewingEmail()?.body }}
                </div>
                <div class="mt-4 text-xs text-gray-400 text-right">
                    {{ viewingEmail()?.date | date:'medium' }}
                </div>
             </div>
          </div>
        </div>
      }

      <!-- Message View Modal -->
      @if (viewingMessage()) {
        <div class="fixed inset-0 z-50 overflow-y-auto">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75" (click)="closeViewMessageModal()"></div>
          <div class="flex items-center justify-center min-h-screen px-4 pb-20 pt-4">
             <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
                <button (click)="closeViewMessageModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-500">
                    <span class="sr-only">Close</span>
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <h3 class="text-lg font-medium text-gray-900 pr-8">Message</h3>
                <div class="mt-4 bg-gray-50 p-4 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto border border-gray-200">
                    {{ viewingMessage()?.content }}
                </div>
                <div class="mt-4 text-xs text-gray-400 text-right">
                    {{ viewingMessage()?.date | date:'medium' }}
                </div>
             </div>
          </div>
        </div>
      }
    </div>
  `
})
export class ProjectsComponent implements OnInit, OnDestroy {
  db = inject(DbService);
  router = inject(Router);

  projects = signal<Project[]>([]);
  meetings = signal<Meeting[]>([]);
  emails = signal<EmailActivity[]>([]);
  messages = signal<Message[]>([]);
  
  allTickets = signal<EnhancedTicket[]>([]);

  zoomLevel = signal(1);
  expandedScrumProjects = signal<Set<string>>(new Set());
  
  viewingEmail = signal<EmailActivity | null>(null);
  viewingMessage = signal<Message | null>(null);

  // Creation State
  newProjectName = '';
  newProjectDesc = '';

  // Manual Ticket State
  showTicketModal = signal(false);
  newTicket = {
      projectId: '',
      type: 'Task',
      title: '',
      description: '',
      priority: 'P2',
      startDate: new Date().toISOString().substring(0, 10),
      endDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10)
  };

  // Message Creation State
  showMessageModal = signal(false);
  newMessageContent = '';
  newMessageDate = new Date().toISOString().substring(0, 16);
  newMessageProjectId = '';

  @ViewChild('timelineContainer') timelineContainer!: ElementRef;
  private lastXScale: d3.ScaleTime<number, number> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
        const p = this.projects();
        const m = this.meetings();
        const e = this.emails();
        const msg = this.messages();
        const t = this.allTickets();
        const z = this.zoomLevel();
        const expanded = this.expandedScrumProjects();

        // Use setTimeout to allow DOM to settle
        if (this.timelineContainer && (p.length > 0 || m.length > 0 || e.length > 0 || msg.length > 0)) {
            setTimeout(() => this.drawTimeline(p, m, e, msg, t, z), 0);
        }
    });
  }

  ngOnInit() {
    this.loadData();
    // Re-draw on window resize
    this.resizeObserver = new ResizeObserver(() => {
        // Debounce slightly
        if (this.timelineContainer) {
            this.drawTimeline(this.projects(), this.meetings(), this.emails(), this.messages(), this.allTickets(), this.zoomLevel());
        }
    });
    // Attach later if element exists, or just rely on effect
  }

  ngOnDestroy() {
    d3.select('body').selectAll('.d3-tooltip').remove();
    this.resizeObserver?.disconnect();
  }

  async loadData() {
    const p = await this.db.getAllProjects();
    const m = await this.db.getAllMeetings();
    const e = await this.db.getAllEmails();
    const msg = await this.db.getAllMessages();
    
    // Extract Tickets
    const tickets: EnhancedTicket[] = [];
    m.forEach(meet => {
        if (meet.tickets) {
            meet.tickets.forEach((t, i) => {
                tickets.push({
                    ...t,
                    meetingId: meet.id,
                    internalId: `${meet.id}_${i}` 
                });
            });
        }
    });

    this.projects.set(p);
    this.meetings.set(m);
    this.emails.set(e);
    this.messages.set(msg);
    this.allTickets.set(tickets);
  }

  // --- Message Logic ---

  openMessageModal(projectId?: string) {
      this.newMessageProjectId = projectId || (this.projects().length > 0 ? this.projects()[0].id : '');
      this.newMessageContent = '';
      this.newMessageDate = new Date().toISOString().slice(0, 16);
      this.showMessageModal.set(true);
  }

  closeMessageModal() {
      this.showMessageModal.set(false);
  }

  async saveNewMessage() {
      if (!this.newMessageContent.trim()) return;

      const msg: Message = {
          id: uuidv4(),
          content: this.newMessageContent,
          date: new Date(this.newMessageDate),
          projectId: this.newMessageProjectId || undefined
      };

      await this.db.addMessage(msg);
      this.closeMessageModal();
      this.loadData();
  }

  closeViewMessageModal() {
      this.viewingMessage.set(null);
  }

  // --- Manual Ticket Logic ---

  openTicketModal(projectId?: string) {
      this.newTicket = {
        projectId: projectId || (this.projects().length > 0 ? this.projects()[0].id : ''),
        type: 'Task',
        title: '',
        description: '',
        priority: 'P2',
        startDate: new Date().toISOString().substring(0, 10),
        endDate: new Date(Date.now() + 86400000 * 2).toISOString().substring(0, 10)
      };
      this.showTicketModal.set(true);
  }

  closeTicketModal() {
      this.showTicketModal.set(false);
  }

  async saveNewTicket() {
      if (!this.newTicket.projectId) return;

      // Logic: Find a "Manual Backlog" meeting for this project, or create one.
      // This avoids changing schema but keeps tickets organized.
      const backlogId = `manual_log_${this.newTicket.projectId}`;
      
      let meeting = await this.db.getMeeting(backlogId);
      if (!meeting) {
          meeting = {
              id: backlogId,
              title: 'Project Backlog',
              date: new Date(),
              duration: 0,
              participants: [],
              tags: ['backlog'],
              projectId: this.newTicket.projectId,
              projectIds: [this.newTicket.projectId],
              tickets: [],
              isVideo: false
          };
          await this.db.saveMeeting(meeting, new Blob([]));
      }

      if (!meeting.tickets) meeting.tickets = [];
      
      const newTicketObj: Ticket = {
          id: uuidv4(), // Fix: Ensure ID is assigned
          title: this.newTicket.title,
          description: this.newTicket.description,
          type: this.newTicket.type,
          priority: this.newTicket.priority,
          startDate: new Date(this.newTicket.startDate).toISOString(),
          endDate: new Date(this.newTicket.endDate).toISOString(),
          projectId: this.newTicket.projectId,
          status: 'proposed'
      };

      meeting.tickets.push(newTicketObj);
      await this.db.updateMeeting(meeting);
      
      this.closeTicketModal();
      this.loadData();
      
      // Auto-expand the project so user sees new ticket
      this.expandedScrumProjects.update(s => {
          const n = new Set(s);
          n.add(this.newTicket.projectId);
          return n;
      });
  }


  // --- Interactions ---

  async updateTicketDate(internalId: string, start: Date, end: Date) {
      const lastUnderscore = internalId.lastIndexOf('_');
      const realMeetingId = internalId.substring(0, lastUnderscore);
      const ticketIndex = parseInt(internalId.substring(lastUnderscore + 1), 10);

      const meeting = await this.db.getMeeting(realMeetingId);
      if (meeting && meeting.tickets && meeting.tickets[ticketIndex]) {
          meeting.tickets[ticketIndex].startDate = start.toISOString();
          meeting.tickets[ticketIndex].endDate = end.toISOString();
          await this.db.updateMeeting(meeting);
          this.loadData();
      }
  }

  async addProject() {
    if (!this.newProjectName.trim()) return;
    await this.db.addProject({
      id: uuidv4(),
      name: this.newProjectName,
      description: this.newProjectDesc
    });
    this.newProjectName = ''; this.newProjectDesc = '';
    this.loadData();
  }

  onZoomChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.zoomLevel.set(parseFloat(input.value));
  }
  
  toggleScrumExpansion(projectId: string) {
    this.expandedScrumProjects.update(set => {
        const newSet = new Set(set);
        if (newSet.has(projectId)) newSet.delete(projectId);
        else newSet.add(projectId);
        return newSet;
    });
  }

  closeEmailModal() {
    this.viewingEmail.set(null);
  }

  // --- VISUALIZATION ---

  drawTimeline(projects: Project[], meetings: Meeting[], emails: EmailActivity[], messages: Message[], allTickets: EnhancedTicket[], zoom: number) {
    const element = this.timelineContainer.nativeElement;
    // container is the element itself for scrolling
    const container = element; 
    
    // --- CLOSURE DEFINITIONS ---
    const updateTicketDateRef = (id: string, s: Date, e: Date) => this.updateTicketDate(id, s, e);
    const toggleScrumRef = (pid: string) => this.toggleScrumExpansion(pid);
    const getTicketColorRef = (t: string | undefined) => this.getTicketColor(t);
    const openAddTicketRef = (pid: string) => this.openTicketModal(pid);
    const openAddMessageRef = (pid: string) => this.openMessageModal(pid);

    // Layout
    const sidebarWidth = 260;
    const margin = { top: 40, right: 30, bottom: 40, left: sidebarWidth }; 
    const laneHeight = 40;
    const projectHeaderHeight = 40;
    const projectPadding = 10;

    d3.select(element).selectAll('*').remove();
    d3.select('body').selectAll('.d3-tooltip').remove();

    if (projects.length === 0 && meetings.length === 0 && emails.length === 0 && messages.length === 0) {
        d3.select(element).append('div').attr('class', 'p-10 text-center text-gray-400').text('No data.');
        return;
    }

    // --- 1. Prepare Data ---
    const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    
    // Helper to determine if an item belongs to a project (Multi-Select Support)
    const isItemInProject = (item: any, projectId: string) => {
        // Direct ID match
        if (item.projectId === projectId) return true;
        // Array match (Meeting)
        if (item.projectIds && Array.isArray(item.projectIds) && item.projectIds.includes(projectId)) return true;
        
        return false;
    };

    // Unassigned Check
    const isUnassigned = (item: any) => {
        const hasLegacy = !!item.projectId;
        const hasArray = item.projectIds && item.projectIds.length > 0;
        return !hasLegacy && !hasArray;
    };

    const hasUnassignedItems = meetings.some(isUnassigned) ||
                               emails.some(isUnassigned) ||
                               messages.some(isUnassigned) ||
                               allTickets.some(isUnassigned);

    const displayProjects = [...sortedProjects];
    if (hasUnassignedItems) {
        displayProjects.push({ id: 'unassigned', name: 'Unassigned', description: 'General Items' });
    }

    const laneYMap = new Map<string, number>();
    const lanes: TimelineLane[] = [];
    let currentY = 0;
    const expandedSet = this.expandedScrumProjects();

    displayProjects.forEach(p => {
        // Project Header
        lanes.push({ 
            id: `project::${p.id}`, 
            label: p.name, 
            projectId: p.id, 
            type: 'project-header', 
            height: projectHeaderHeight,
            y: currentY 
        });
        currentY += projectHeaderHeight;

        // Unified Activity Lane (Meetings + Emails + Messages)
        lanes.push({ id: `${p.id}::activity`, label: 'Activity', projectId: p.id, type: 'sub-lane', height: laneHeight, y: currentY });
        currentY += laneHeight;
        
        // Scrum Root
        const isExpanded = expandedSet.has(p.id);
        lanes.push({ id: `${p.id}::scrum_root`, label: 'Scrum Artifacts', projectId: p.id, type: 'scrum-header', isExpanded, height: laneHeight, y: currentY });
        currentY += laneHeight;

        if (isExpanded) {
            // Filter tickets for this project lane
            const pTickets = allTickets.filter(t => {
                if (p.id === 'unassigned') return isUnassigned(t);
                
                if (t.projectId === p.id) return true; // Explicit assignment
                if (t.projectId) return false; // Assigned to another project explicitly
                
                // Inherit from meeting
                const m = meetings.find(meet => meet.id === t.meetingId);
                return m ? isItemInProject(m, p.id) : false;
            });
            
            const typeRank = (t: string) => {
                const type = (t || '').toLowerCase();
                if (type.includes('epic')) return 1;
                if (type.includes('story') || type.includes('feature')) return 2;
                if (type.includes('task')) return 3;
                if (type.includes('bug')) return 4;
                if (type.includes('improve')) return 5;
                return 6;
            };

            pTickets.sort((a, b) => {
                const rankA = typeRank(a.type);
                const rankB = typeRank(b.type);
                if (rankA !== rankB) return rankA - rankB;
                return a.title.localeCompare(b.title);
            });

            if (pTickets.length === 0) {
                 lanes.push({ id: `${p.id}::empty`, label: '(No tickets)', projectId: p.id, type: 'sub-lane', indent: 1, height: laneHeight, y: currentY });
                 currentY += laneHeight;
            } else {
                pTickets.forEach(t => {
                    const rank = typeRank(t.type);
                    const laneUniqueId = `ticket::${t.internalId}::${p.id}`; 
                    
                    lanes.push({ 
                        id: laneUniqueId, 
                        label: t.title, 
                        projectId: p.id, 
                        type: 'ticket-lane',
                        ticketId: t.internalId,
                        ticketRaw: t,
                        indent: rank,
                        height: laneHeight,
                        y: currentY
                    });
                    currentY += laneHeight;
                });
            }
        }
        currentY += projectPadding;
    });
    
    // Fill Map
    lanes.forEach(l => laneYMap.set(l.id, l.y));

    // --- 2. Setup Canvas ---
    const totalHeight = currentY;
    const width = Math.max(element.clientWidth - sidebarWidth, element.clientWidth * zoom);
    
    // We want the SVG to handle the scrolling
    const svg = d3.select(element).append('svg')
        .attr('width', width + margin.left) // Full scrolling width
        .attr('height', totalHeight + margin.top + margin.bottom);
        
    // --- 3. Time Scale ---
    const today = new Date();
    let minDate = new Date(today.getTime() - 7 * 86400000);
    let maxDate = new Date(today.getTime() + 14 * 86400000);

    const dates: Date[] = [];
    meetings.forEach(m => dates.push(new Date(m.date)));
    emails.forEach(e => dates.push(new Date(e.date)));
    messages.forEach(msg => dates.push(new Date(msg.date)));
    allTickets.forEach(t => { if(t.startDate) dates.push(new Date(t.startDate)); if(t.endDate) dates.push(new Date(t.endDate)); });
    
    if (dates.length > 0) {
        minDate = d3.min(dates)!;
        maxDate = d3.max(dates)!;
        minDate = new Date(minDate.getTime() - 5*86400000);
        maxDate = new Date(maxDate.getTime() + 5*86400000);
    }

    const x = d3.scaleTime().domain([minDate, maxDate]).range([0, width]);
    this.lastXScale = x;

    // --- 4. Render Groups ---
    // Order matters: Content first (behind), then Sidebar (on top)
    const contentGroup = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);
    const sidebarGroup = svg.append('g').attr('transform', `translate(0, ${margin.top})`);
    
    // --- 5. Content Rendering ---

    // Vertical grid lines for days
    const xAxis = d3.axisTop(x).ticks(10).tickSize(-totalHeight).tickFormat(null);
    contentGroup.append('g')
        .attr('class', 'grid-lines text-gray-200 opacity-50')
        .attr('transform', `translate(0, 0)`)
        .call(xAxis)
        .selectAll('text').remove(); // remove text from grid, we keep axis text separate or top

    // Background stripes (alternating) inside content so they scroll
    lanes.forEach(l => {
        if (l.type === 'project-header') {
            contentGroup.append('rect')
                .attr('x', 0).attr('y', l.y).attr('width', width).attr('height', l.height)
                .attr('fill', '#f3f4f6').attr('stroke', '#e5e7eb');
        } else {
             contentGroup.append('line')
                .attr('x1', 0).attr('x2', width).attr('y1', l.y + l.height).attr('y2', l.y + l.height)
                .attr('stroke', '#e5e7eb').attr('stroke-dasharray', '2');
        }

        // Interaction Zone for Drawing Tickets
        if (l.type === 'ticket-lane') {
            const laneRect = contentGroup.append('rect')
                .attr('x', 0).attr('y', l.y).attr('width', width).attr('height', l.height)
                .attr('fill', 'transparent')
                .attr('cursor', 'crosshair');
            
            // Draw Drag
            const dragDraw = d3.drag()
                .on('start', (event) => {
                    const startX = event.x;
                    const startTime = x.invert(startX);
                    const feedbackRect = contentGroup.append('rect')
                        .attr('class', 'feedback-rect')
                        .attr('y', l.y + 10).attr('height', 20)
                        .attr('x', startX).attr('width', 0)
                        .attr('fill', 'rgba(99, 102, 241, 0.3)').attr('stroke', '#6366f1').attr('stroke-dasharray', '4');
                    event.subject.startX = startX;
                    event.subject.feedback = feedbackRect;
                    event.subject.startTime = startTime;
                })
                .on('drag', (event) => {
                    const currentX = event.x;
                    const startX = event.subject.startX;
                    const w = Math.abs(currentX - startX);
                    const newX = Math.min(startX, currentX);
                    event.subject.feedback.attr('x', newX).attr('width', w);
                })
                .on('end', (event) => {
                    const startX = event.subject.startX;
                    const endX = event.x;
                    event.subject.feedback.remove();
                    if (Math.abs(endX - startX) < 5) return;
                    const d1 = x.invert(startX);
                    const d2 = x.invert(endX);
                    updateTicketDateRef(l.ticketId!, d1 < d2 ? d1 : d2, d1 < d2 ? d2 : d1);
                });
            laneRect.call(dragDraw as any);
        }
    });

    // Time Axis Text (Sticky Top?) - Just putting it at top of content for now
    contentGroup.append('g')
        .attr('transform', `translate(0, -10)`)
        .call(d3.axisTop(x));

    // --- Nodes (Bars/Dots) ---
    const tooltip = d3.select('body').append('div').attr('class', 'd3-tooltip fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 pointer-events-none p-2 text-sm text-gray-800');

    // Mapped Nodes
    const nodes: any[] = [];
    
    // Iterate Lanes to place nodes in correct vertical position
    // Since an item might appear in multiple lanes, we iterate lanes first, then find items for that lane
    
    displayProjects.forEach(p => {
        // Activity Lane (Meetings + Emails + Messages)
        const activityLaneId = `${p.id}::activity`;
        if (laneYMap.has(activityLaneId)) {
            const laneY = laneYMap.get(activityLaneId)!;
            
            // Meetings
            meetings.forEach(m => {
                let shouldShow = false;
                if (p.id === 'unassigned') shouldShow = isUnassigned(m);
                else shouldShow = isItemInProject(m, p.id);

                if (shouldShow) {
                    nodes.push({ id: m.id, type: 'meeting', title: m.title, start: new Date(m.date), y: laneY + laneHeight/2, raw: m });
                }
            });

            // Emails
            emails.forEach(e => {
                let shouldShow = false;
                if (p.id === 'unassigned') shouldShow = isUnassigned(e);
                else shouldShow = isItemInProject(e, p.id);

                if (shouldShow) {
                    nodes.push({ id: e.id, type: 'email', title: e.subject, start: new Date(e.date), y: laneY + laneHeight/2, raw: e });
                }
            });

            // Messages
            messages.forEach(msg => {
                let shouldShow = false;
                if (p.id === 'unassigned') shouldShow = isUnassigned(msg);
                else shouldShow = isItemInProject(msg, p.id);

                if (shouldShow) {
                    nodes.push({ id: msg.id, type: 'message', title: msg.content, start: new Date(msg.date), y: laneY + laneHeight/2, raw: msg });
                }
            });
        }
    });
    
    // Ticket Bars (Explicit Lanes)
    lanes.filter(l => l.type === 'ticket-lane').forEach(lane => {
        const t = lane.ticketRaw!;
        if (t.startDate && t.endDate) {
            nodes.push({ 
                id: t.internalId, type: 'ticket', subType: t.type, title: t.title, 
                start: new Date(t.startDate), end: new Date(t.endDate), 
                y: lane.y + laneHeight/2, raw: t 
            });
        }
    });


    const nodeG = contentGroup.selectAll('.node')
        .data(nodes).enter().append('g')
        .attr('transform', d => `translate(${x(d.start)}, ${d.y})`);
    
    // Meeting Dot (Indigo)
    nodeG.filter(d => d.type === 'meeting').append('circle')
        .attr('r', 8).attr('fill', '#4f46e5').attr('stroke', '#fff').attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', (e, d) => this.router.navigate(['/meeting', d.id]));

    // Email Square (Orange)
    nodeG.filter(d => d.type === 'email').append('rect')
        .attr('x', -6).attr('y', -6).attr('width', 12).attr('height', 12).attr('rx', 2)
        .attr('fill', '#f97316').attr('stroke', '#fff').attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', (e, d) => this.viewingEmail.set(d.raw));

    // Message Triangle (Teal)
    nodeG.filter(d => d.type === 'message').append('path')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(100))
        .attr('fill', '#14b8a6').attr('stroke', '#fff').attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', (e, d) => this.viewingMessage.set(d.raw));
    
    // Text Labels for Points
    nodeG.filter(d => d.type !== 'ticket').append('text')
        .text(d => d.title.length > 20 ? d.title.substring(0, 18) + '..' : d.title)
        .attr('y', -12).attr('text-anchor', 'middle')
        .attr('class', 'text-[10px] font-medium fill-gray-700 pointer-events-none')
        .style('text-shadow', '0 0 3px white');

    // Ticket Bars
    const bars = contentGroup.selectAll('.ticket-bar')
        .data(nodes.filter(d => d.type === 'ticket')).enter().append('g')
        .attr('transform', d => `translate(0, ${d.y})`);
    
    bars.append('rect')
        .attr('class', 'gantt-bar')
        .attr('x', d => x(d.start))
        .attr('y', -10)
        .attr('width', d => Math.max(5, x(d.end) - x(d.start)))
        .attr('height', 20)
        .attr('rx', 4)
        .attr('fill', d => getTicketColorRef(d.subType))
        .attr('stroke', '#fff').attr('stroke-width', 1)
        .style('cursor', 'ew-resize');
    
    // Bar Dragging
    const barDrag = d3.drag()
        .on('drag', function(event, d: any) {
            const dx = event.dx;
            const g = d3.select(this); // rect
            const curr = parseFloat(g.attr('x'));
            g.attr('x', curr + dx);
        })
        .on('end', function(event, d: any) {
            const g = d3.select(this);
            const finalX = parseFloat(g.attr('x'));
            const shift = x.invert(finalX).getTime() - x.invert(x(d.start)).getTime();
            updateTicketDateRef(d.id, new Date(d.start.getTime() + shift), new Date(d.end.getTime() + shift));
        });
    bars.select('rect').call(barDrag as any);

    // Tooltips
    nodeG.on('mouseenter', (event, d) => {
        let html = `<b>${d.title}</b><br/>${d.start.toLocaleDateString()}`;
        if (d.end) html += ` - ${d.end.toLocaleDateString()}`;
        tooltip.style('opacity', 1).html(html).style('left', (event.pageX+10)+'px').style('top', (event.pageY-10)+'px');
    }).on('mouseleave', () => tooltip.style('opacity', 0));
    bars.on('mouseenter', (event, d) => {
         let html = `<b>${d.title}</b><br/>${d.start.toLocaleDateString()} - ${d.end.toLocaleDateString()}`;
         tooltip.style('opacity', 1).html(html).style('left', (event.pageX+10)+'px').style('top', (event.pageY-10)+'px');
    }).on('mouseleave', () => tooltip.style('opacity', 0));


    // --- 6. Sidebar Rendering (Sticky) ---
    // Background for sidebar to cover content when scrolling
    sidebarGroup.append('rect')
        .attr('x', 0).attr('y', -margin.top).attr('width', sidebarWidth).attr('height', totalHeight + margin.top + margin.bottom)
        .attr('fill', 'white')
        .attr('class', 'shadow-[4px_0_24px_rgba(0,0,0,0.05)] border-r border-gray-200');

    // Sidebar Items
    const sideItems = sidebarGroup.selectAll('.side-item')
        .data(lanes).enter().append('g')
        .attr('transform', d => `translate(0, ${d.y})`);

    sideItems.each(function(d) {
        const g = d3.select(this);
        const h = d.height;
        const indent = (d.indent || 0) * 15;
        const xPos = 15 + indent;

        // Divider
        g.append('line').attr('x1', 0).attr('x2', sidebarWidth).attr('y1', h).attr('y2', h).attr('stroke', '#f3f4f6');

        if (d.type === 'project-header') {
             g.append('text').attr('x', 10).attr('y', h/2).text(d.label)
              .attr('class', 'font-bold text-sm text-gray-900').style('alignment-baseline', 'middle');
             
             // Add Ticket Button (Contextual)
             g.append('text').attr('x', sidebarWidth - 25).attr('y', h/2).text('+')
              .attr('class', 'font-bold text-lg text-gray-400 hover:text-indigo-600 cursor-pointer')
              .style('alignment-baseline', 'middle')
              .on('click', () => openAddTicketRef(d.projectId));

        } else if (d.type === 'sub-lane' && d.label === 'Activity') {
             g.append('text').attr('x', xPos).attr('y', h/2).text(d.label)
                .attr('class', 'text-xs text-gray-500').style('alignment-baseline', 'middle');
             
             // Add Message Button
             g.append('text').attr('x', sidebarWidth - 50).attr('y', h/2).text('+ Msg')
                .attr('class', 'text-[10px] font-bold text-indigo-500 hover:text-indigo-700 cursor-pointer bg-indigo-50 px-1 rounded')
                .style('alignment-baseline', 'middle')
                .on('click', () => openAddMessageRef(d.projectId));

        } else if (d.type === 'scrum-header') {
             const icon = d.isExpanded ? '[-]' : '[+]';
             g.append('text').attr('x', xPos).attr('y', h/2).text(`${icon} ${d.label}`)
                .attr('class', 'text-xs font-bold cursor-pointer fill-indigo-600 hover:fill-indigo-800')
                .style('alignment-baseline', 'middle')
                .on('click', () => toggleScrumRef(d.projectId));

             // Add Ticket Button (Contextual)
             g.append('text').attr('x', sidebarWidth - 25).attr('y', h/2).text('+')
              .attr('class', 'font-bold text-lg text-gray-400 hover:text-indigo-600 cursor-pointer')
              .style('alignment-baseline', 'middle')
              .on('click', () => openAddTicketRef(d.projectId));

        } else if (d.type === 'ticket-lane') {
             const color = getTicketColorRef(d.ticketRaw?.type);
             g.append('rect').attr('x', xPos).attr('y', h/2 - 4).attr('width', 8).attr('height', 8).attr('rx', 2).attr('fill', color);
             
             const label = d.label.length > 28 ? d.label.substring(0, 25) + '...' : d.label;
             g.append('text').attr('x', xPos + 15).attr('y', h/2).text(label)
                .attr('class', 'text-xs text-gray-600').style('alignment-baseline', 'middle')
                .append('title').text(d.label);

        } else {
             g.append('text').attr('x', xPos).attr('y', h/2).text(d.label)
                .attr('class', 'text-xs text-gray-500').style('alignment-baseline', 'middle');
        }
    });

    // --- 7. Sticky Scroll Logic ---
    // We listen to the container scroll event and translate the sidebar group to match scrollLeft
    // This creates the "Sticky" effect on the X-axis
    element.onscroll = () => {
        const left = element.scrollLeft;
        sidebarGroup.attr('transform', `translate(${left}, ${margin.top})`);
    };
    
    // Initial alignment
    element.dispatchEvent(new Event('scroll'));
  }

  normalizeTicketType(type: string): string {
      const t = (type || '').toLowerCase();
      if (t.includes('epic')) return 'Epic';
      if (t.includes('feature') || t.includes('story') || t.includes('requirement')) return 'User Story';
      if (t.includes('bug')) return 'Bug';
      if (t.includes('improve')) return 'Improvement';
      return 'Task';
  }

  getTicketColor(type: string | undefined): string {
      const t = this.normalizeTicketType(type || '');
      switch (t) {
          case 'Epic': return '#a855f7'; 
          case 'User Story': return '#3b82f6'; 
          case 'Bug': return '#ef4444'; 
          case 'Improvement': return '#f59e0b';
          default: return '#10b981';
      }
  }
}
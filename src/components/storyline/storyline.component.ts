import { Component, Input, OnInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbService, StorylineMessage, User, Project, Meeting, Ticket, EmailActivity } from '../../services/db.service';
import { AiService } from '../../services/ai.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-storyline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl w-[350px] fixed right-0 top-16 bottom-0 z-40 transition-transform duration-300"
         [class.translate-x-full]="!isOpen()"
         [class.translate-x-0]="isOpen()">
      
      <!-- Header -->
      <div class="flex flex-col border-b border-gray-200 bg-gray-50">
          <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-gray-800">Storyline</h3>
              <span class="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full font-medium">Beta</span>
            </div>
            <div class="flex gap-2">
                <button (click)="createTopic()" class="text-gray-400 hover:text-indigo-600" title="New Topic">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                </button>
                <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
            </div>
          </div>
          
          <!-- Topics Bar -->
          <div class="flex overflow-x-auto px-2 pb-0 gap-1 scrollbar-hide">
              @for (topic of topics(); track topic.id) {
                  <button (click)="selectTopic(topic.id)" 
                      [class]="activeTopicId() === topic.id ? 'border-indigo-500 text-indigo-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
                      class="px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap rounded-t-lg transition-colors">
                      {{ topic.name }}
                  </button>
              }
          </div>
      </div>

      <!-- Messages Area -->
      <div #scrollContainer class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        @if (messages().length === 0) {
          <div class="text-center py-10 text-gray-400 text-sm">
            <p>No messages yet.</p>
            <p class="text-xs mt-1">Start the conversation!</p>
          </div>
        }

        @for (msg of messages(); track msg.id) {
          <div class="group flex gap-3" [class.flex-row-reverse]="isCurrentUser(msg.userId)">
            <!-- Avatar -->
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 border border-indigo-200">
              {{ getInitials(msg.senderName || 'User') }}
            </div>

            <!-- Message Bubble -->
            <div class="flex flex-col max-w-[80%]" [class.items-end]="isCurrentUser(msg.userId)">
              <div class="flex items-baseline gap-2 mb-1 flex-wrap">
                <span class="text-xs font-bold text-gray-700">{{ msg.senderName }}</span>
                @if (msg.projectName) {
                    <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200">{{ msg.projectName }}</span>
                }
                <span class="text-[10px] text-gray-400">{{ msg.timestamp | date:'shortTime' }}</span>
              </div>
              
              <div [class]="'p-3 rounded-lg text-sm shadow-sm ' + (isCurrentUser(msg.userId) ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-200')">
                <p class="whitespace-pre-wrap" [innerHTML]="renderMessage(msg.content)" (click)="handleMessageClick($event)"></p>
                
                <!-- Artifacts -->
                @if (msg.artifacts && msg.artifacts.length > 0) {
                  <div class="mt-2 pt-2 border-t border-white/20 flex flex-wrap gap-2">
                    @for (art of msg.artifacts; track art.id) {
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-black/10 hover:bg-black/20 cursor-pointer transition-colors"
                            (click)="navigateToArtifact(art)">
                        <span class="opacity-70 mr-1">#{{ art.type }}:</span> {{ art.label }}
                      </span>
                    }
                  </div>
                }
                
                <!-- Artifact Ref (System Messages) -->
                @if (msg.artifactRef) {
                    <div class="mt-2 pt-2 border-t border-gray-200/50">
                        <a href="javascript:void(0)" (click)="navigateToArtifact(msg.artifactRef!)" class="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors border border-gray-200">
                            <span class="text-lg">{{ getArtifactIcon(msg.artifactRef!.type) }}</span>
                            <div class="flex flex-col">
                                <span class="font-medium text-indigo-600">{{ msg.artifactRef!.title }}</span>
                                <span class="text-[10px] text-gray-500 uppercase">{{ msg.artifactRef!.type }}</span>
                            </div>
                        </a>
                    </div>
                }
              </div>

              <!-- Reactions & Actions -->
              <div class="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button (click)="replyTo(msg)" class="text-xs text-gray-400 hover:text-indigo-600">Reply</button>
              </div>
            </div>
          </div>
        }
        
        @if (isProcessing()) {
          <div class="flex gap-3">
             <div class="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 border border-purple-200">AI</div>
             <div class="bg-white p-3 rounded-lg rounded-tl-none border border-gray-200 shadow-sm">
               <div class="flex space-x-1">
                 <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                 <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                 <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
               </div>
             </div>
          </div>
        }
      </div>

      <!-- Input Area -->
      <div class="p-4 bg-white border-t border-gray-200 relative">
        
        <!-- Typeahead Dropdown -->
        @if (showTypeahead()) {
            <div class="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                @for (item of filteredSuggestions(); track item.id) {
                    <button (click)="selectSuggestion(item)" class="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2 text-sm border-b border-gray-50 last:border-0">
                        <span>{{ item.icon }}</span>
                        <span class="font-medium text-gray-900">{{ item.label }}</span>
                        <span class="text-xs text-gray-400 ml-auto capitalize">{{ item.type }}</span>
                    </button>
                }
                @if (filteredSuggestions().length === 0) {
                    <div class="px-3 py-2 text-xs text-gray-400 italic">No matches found</div>
                }
            </div>
        }

        @if (replyingTo()) {
          <div class="flex items-center justify-between bg-gray-50 px-3 py-2 rounded mb-2 text-xs border border-gray-200">
            <span class="text-gray-600 truncate">Replying to <b>{{ replyingTo()?.senderName }}</b></span>
            <button (click)="replyingTo.set(null)" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
          </div>
        }
        
        <div class="relative">
          <textarea 
            #messageInput
            [(ngModel)]="newMessage" 
            (input)="onInput($event)"
            (keydown.enter)="$event.preventDefault(); sendMessage()"
            placeholder="Type a message or use # to link artifacts..."
            class="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-3 pr-10 resize-none"
            rows="2"
          ></textarea>
          <button 
            (click)="sendMessage()"
            [disabled]="!newMessage.trim() || isProcessing()"
            class="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:bg-gray-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p class="text-[10px] text-gray-400 mt-2 text-center">
          Tip: Use <b>#</b> to link meetings, tickets, or emails. Mention <b>@users</b>.
        </p>
      </div>
    </div>
  `,
  styles: [`
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
  `]
})
export class StorylineComponent implements OnInit {
  @Input() projectId!: string;
  @Input() isOpen = signal(false);
  @Input() close = new EventEmitter<void>(); // This needs to be an Output really, but using Input for signal pattern if needed, though standard Output is better.
  // Actually, standard Output is better for events.
  // Let's fix this in a moment, but for now I'll use a standard Output property if I can import it.
  
  db = inject(DbService);
  ai = inject(AiService);
  
  messages = signal<StorylineMessage[]>([]);
  currentUser = signal<User | null>(null);
  users = signal<User[]>([]);
  
  newMessage = '';
  isProcessing = signal(false);
  replyingTo = signal<StorylineMessage | null>(null);
  
  allArtifacts = signal<{type: string, id: string, title: string}[]>([]);
  
  // Typeahead State
  showTypeahead = signal(false);
  typeaheadType = signal<'user' | 'artifact' | null>(null);
  typeaheadQuery = signal('');
  filteredSuggestions = computed(() => {
      const q = this.typeaheadQuery().toLowerCase();
      if (this.typeaheadType() === 'user') {
          return this.users().filter(u => u.name.toLowerCase().includes(q)).map(u => ({
              id: u.id, label: u.name, type: 'user', icon: '👤'
          }));
      } else if (this.typeaheadType() === 'artifact') {
          return this.allArtifacts().filter(a => a.title.toLowerCase().includes(q)).map(a => ({
              id: a.id, label: a.title, type: a.type, icon: this.getArtifactIcon(a.type)
          }));
      }
      return [];
  });
  
  // ... existing properties
  
  topics = signal<{id: string, name: string}[]>([]);
  activeTopicId = signal<string | null>(null);
  
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  async ngOnInit() {
    await this.loadData();
    // Mock current user for now since we don't have auth
    const users = await this.db.getUsers();
    if (users.length > 0) {
      this.currentUser.set(users[0]);
    } else {
      // Create a default user if none
      const me = { id: 'user_me', name: 'Me', email: 'me@example.com' };
      await this.db.addUser(me);
      this.currentUser.set(me);
      this.users.set([me]);
    }
    
    // Load Artifacts for Typeahead
    const meetings = await this.db.getAllMeetings();
    const emails = await this.db.getAllEmails();
    const pMeetings = meetings.filter(m => m.projectId === this.projectId || (m.projectIds && m.projectIds.includes(this.projectId)));
    const pEmails = emails.filter(e => e.projectId === this.projectId);
    
    this.allArtifacts.set([
        ...pMeetings.map(m => ({ type: 'meeting', id: m.id, title: m.title })),
        ...pEmails.map(e => ({ type: 'email', id: e.id, title: e.subject }))
    ]);
    
    await this.loadTopics();
  }
  
  async loadTopics() {
      if (!this.projectId) return;
      let topics = await this.db.getProjectTopics(this.projectId);
      
      // Ensure "General" exists
      if (topics.length === 0) {
          const general = {
              id: `topic_general_${this.projectId}`,
              projectId: this.projectId,
              name: 'General',
              createdAt: new Date()
          };
          await this.db.createTopic(general);
          topics = [general];
      }
      
      this.topics.set(topics);
      
      // Select first topic if none selected
      if (!this.activeTopicId() && topics.length > 0) {
          this.activeTopicId.set(topics[0].id);
      }
      
      this.refreshMessages();
  }
  
  selectTopic(topicId: string) {
      this.activeTopicId.set(topicId);
      this.refreshMessages();
  }
  
  async createTopic() {
      const name = prompt("Enter topic name:");
      if (name && this.projectId) {
          const topic = {
              id: uuidv4(),
              projectId: this.projectId,
              name: name,
              createdAt: new Date()
          };
          await this.db.createTopic(topic);
          await this.loadTopics();
          this.selectTopic(topic.id);
      }
  }
  
  getArtifactIcon(type: string) {
      switch(type) {
          case 'meeting': return '📅';
          case 'email': return '✉️';
          case 'ticket': return '🎫';
          default: return '📄';
      }
  }

  onInput(event: Event) {
      const input = event.target as HTMLTextAreaElement;
      const val = input.value;
      const cursor = input.selectionStart;
      
      // Find the word being typed
      const textBeforeCursor = val.substring(0, cursor);
      const match = textBeforeCursor.match(/([#@])(\w*)$/);
      
      if (match) {
          this.showTypeahead.set(true);
          this.typeaheadType.set(match[1] === '@' ? 'user' : 'artifact');
          this.typeaheadQuery.set(match[2]);
      } else {
          this.showTypeahead.set(false);
      }
  }
  
  selectSuggestion(item: any) {
      const input = this.messageInput.nativeElement;
      const val = input.value;
      const cursor = input.selectionStart;
      const textBeforeCursor = val.substring(0, cursor);
      const match = textBeforeCursor.match(/([#@])(\w*)$/);
      
      if (match) {
          const prefix = val.substring(0, match.index!);
          const suffix = val.substring(cursor);
          
          let token = '';
          if (item.type === 'user') {
              token = `@[user|${item.id}|${item.label}] `;
          } else {
              token = `#[${item.type}|${item.id}|${item.label}] `;
          }
          
          this.newMessage = prefix + token + suffix;
          this.showTypeahead.set(false);
          
          setTimeout(() => {
              input.focus();
              input.selectionStart = input.selectionEnd = prefix.length + token.length;
          });
      }
  }

  renderMessage(content: string): string {
      if (!content) return '';
      // Replace Artifact Tokens
      let html = content.replace(/#\[([^|]+)\|([^|]+)\|([^\]]+)\]/g, (match, type, id, label) => {
          return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 cursor-pointer hover:underline" data-type="${type}" data-id="${id}">#${label}</span>`;
      });
      
      // Replace User Tokens
      html = html.replace(/@\[([^|]+)\|([^|]+)\|([^\]]+)\]/g, (match, type, id, label) => {
          return `<span class="font-bold text-indigo-600">@${label}</span>`;
      });
      
      return html;
  }
  
  handleMessageClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      // Check if clicked element or parent is a mention span
      const span = target.closest('span[data-type]');
      if (span) {
          const type = span.getAttribute('data-type');
          const id = span.getAttribute('data-id');
          if (type && id) {
              this.navigateToArtifact({ type, id });
          }
      }
  }
  
  async loadData() {
    this.users.set(await this.db.getUsers());
  }
  
  async refreshMessages() {
    if (this.activeTopicId()) {
      const msgs = await this.db.getTopicMessages(this.activeTopicId()!);
      this.messages.set(msgs);
      this.scrollToBottom();
    }
  }
  
  scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        const el = this.scrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }
  
  isCurrentUser(userId: string): boolean {
    return this.currentUser()?.id === userId;
  }
  
  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }
  
  replyTo(msg: StorylineMessage) {
    this.replyingTo.set(msg);
    // Focus input
  }
  
  async sendMessage() {
    if (!this.newMessage.trim() || !this.currentUser() || !this.activeTopicId()) return;
    
    let content = this.newMessage;
    this.newMessage = ''; 
    this.isProcessing.set(true);
    
    try {
      // 1. Check for @AI mention and Clean Content
      const isAiMentioned = content.includes('@AI') || content.includes('@ai');
      const cleanContent = content.replace(/@AI/gi, '').trim();

      // 2. Save User Message FIRST (Cleaned)
      const userMsgId = uuidv4();
      await this.saveMessage({
           id: userMsgId,
           projectId: this.projectId,
           topicId: this.activeTopicId()!,
           userId: this.currentUser()!.id,
           senderName: this.currentUser()!.name,
           content: cleanContent || content, // Fallback if empty after clean
           timestamp: new Date(),
           parentId: this.replyingTo()?.id,
           messageType: 'user'
      });
      await this.refreshMessages();

      if (isAiMentioned) {
          // 3. Call AI Agent
          const project = (await this.db.getAllProjects()).find(p => p.id === this.projectId);
          const meetings = await this.db.getAllMeetings();
          const emails = await this.db.getAllEmails();
          
          const projectMeetings = meetings.filter(m => 
            m.projectId === this.projectId || (m.projectIds && m.projectIds.includes(this.projectId))
          );
          const projectEmails = emails.filter(e => e.projectId === this.projectId);
          
          const artifactIndex = [
            ...projectMeetings.map(m => ({ type: 'meeting', id: m.id, title: m.title })),
            ...projectEmails.map(e => ({ type: 'email', id: e.id, title: e.subject })),
          ];
          
          const response = await this.ai.chatWithStoryline({
            project_id: this.projectId,
            topic_id: this.activeTopicId()!,
            current_user: {
              user_id: this.currentUser()!.id,
              display_name: this.currentUser()!.name,
              permissions: ['read', 'write']
            },
            users: this.users().map(u => ({ user_id: u.id, display_name: u.name })),
            recent_storyline_messages: this.messages().slice(-10),
            artifact_index_summary: artifactIndex,
            user_message: cleanContent, // Send cleaned message
            parent_message_id: this.replyingTo()?.id
          });
          
          // 4. Process Actions (AI Reply via post_message)
          if (response.actions) {
              for (const action of response.actions) {
                  if (action.tool === 'storyline.post_message') {
                      await this.saveMessage({
                          id: uuidv4(),
                          projectId: this.projectId,
                          topicId: this.activeTopicId()!,
                          userId: 'ai_assistant',
                          senderName: 'Storyline AI',
                          content: action.args.content,
                          timestamp: new Date(),
                          parentId: this.replyingTo()?.id,
                          messageType: 'ai',
                          artifacts: action.args.artifacts
                      });
                  }
                  // Handle other tools
              }
          }
          
          // Fallback if AI used assistant_message (legacy support)
          if (response.assistant_message && !response.actions?.some((a: any) => a.tool === 'storyline.post_message')) {
             await this.saveMessage({
               id: uuidv4(),
               projectId: this.projectId,
               topicId: this.activeTopicId()!,
               userId: 'ai_assistant',
               senderName: 'Storyline AI',
               content: response.assistant_message,
               timestamp: new Date(),
               parentId: this.replyingTo()?.id,
               messageType: 'ai'
             });
          }
          
          await this.refreshMessages();
      }
      
      this.replyingTo.set(null);
      
    } catch (e) {
      console.error('Storyline error', e);
    } finally {
      this.isProcessing.set(false);
    }
  }
  
  async saveMessage(msg: StorylineMessage) {
    await this.db.saveStorylineMessage(msg);
  }
  
  navigateToArtifact(art: {type: string, id: string}) {
    // Simple navigation logic
    console.log('Navigating to', art);
    // In a real app, we'd use Router
  }
}

import { EventEmitter, Output } from '@angular/core';

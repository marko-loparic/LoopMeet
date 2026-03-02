import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { Subject } from 'rxjs';

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  duration: number; // seconds
  participants: string[];
  tags: string[];
  audioBlob?: Blob; // stored in 'audio' store
  isVideo?: boolean; 
  transcript?: string;
  summary?: any; // JSON
  tickets?: Ticket[]; // JSON
  chatHistory?: any[];
  projectId?: string; // Legacy single project
  projectIds?: string[]; // New: Multiple projects
  audioData?: string; // Temporary field for legacy export
  videoUrl?: string;
  audioUrl?: string;
  media_status?: 'recording' | 'finalizing' | 'uploaded' | 'upload_failed';
  media_bytes?: number;
  media_mime?: string;
}

export interface AIJob {
  id: string;
  meetingId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'stale' | 'success' | 'queued';
  progress: number;
  step?: string;
  error?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  heartbeat?: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface MeetingSpeakerMap {
  id?: string;
  meetingId: string;
  speakerId: string;
  userId: string;
  userDisplayName?: string;
  speakerDisplay?: string;
  updatedAt?: Date;
}

export interface Message {
  id: string;
  subject?: string;
  content: string;
  date: Date;
  projectId?: string;
}

export interface EmailActivity {
  id: string;
  subject: string;
  sender: string;
  date: Date;
  body: string;
  projectId?: string;
}

export interface Ticket {
  id?: string;        
  type: string;
  title: string;
  description: string;
  priority: string;
  owner?: string;
  status?: string;
  projectId?: string; 
  startDate?: string; // ISO Date string
  endDate?: string;   // ISO Date string
  
  // Story Mapping Fields
  epicId?: string;    // ID of the parent Epic ticket
  release?: string;   // 'Release 1', 'Release 2', 'Backlog'
}

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private dbName = 'LoopMeetDB';
  private version = 11;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private artifactCreated = new Subject<{ projectId: string, artifact: any }>();
  artifactCreated$ = this.artifactCreated.asObservable();

  constructor() {
    this.initDB().catch(err => console.warn('DB init deferred:', err));
  }

  private initDB(): Promise<void> {
    if (this.db) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = (event) => {
        console.error('IndexedDB error:', request.error);
        this.initPromise = null;
        reject(request.error || new Error('Error opening DB'));
      };

      request.onblocked = () => {
        console.warn('IndexedDB blocked');
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('meetings')) {
          const store = db.createObjectStore('meetings', { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('emails')) {
          const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
          emailStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('ai_jobs')) {
          const jobStore = db.createObjectStore('ai_jobs', { keyPath: 'id' });
          jobStore.createIndex('meetingId', 'meetingId', { unique: false });
        }
        if (!db.objectStoreNames.contains('speaker_mappings')) {
          db.createObjectStore('speaker_mappings', { keyPath: ['meetingId', 'speakerId'] });
        }
        if (!db.objectStoreNames.contains('recording_backups')) {
          db.createObjectStore('recording_backups', { keyPath: 'meetingId' });
        }
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketStore.createIndex('projectId', 'projectId', { unique: false });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        
        this.db!.onversionchange = () => {
            this.db?.close();
            this.db = null;
            this.initPromise = null;
        };

        resolve();
      };
    });
    
    return this.initPromise;
  }

  // --- Meetings ---

  async saveMeeting(meeting: Meeting, mediaBlob: Blob): Promise<void> {
    if (!this.db) await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings', 'audio'], 'readwrite');
      
      const meetingStore = transaction.objectStore('meetings');
      meetingStore.put(meeting);

      const audioStore = transaction.objectStore('audio');
      audioStore.put({ id: meeting.id, blob: mediaBlob });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Transaction failed');
    });
  }

  async updateMeeting(meeting: Meeting): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings'], 'readwrite');
      const store = transaction.objectStore('meetings');
      store.put(meeting);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Update failed');
    });
  }

  async getAllMeetings(): Promise<Meeting[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings'], 'readonly');
      const store = transaction.objectStore('meetings');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.date.getTime() - a.date.getTime()));
      request.onerror = () => reject('Get all failed');
    });
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings'], 'readonly');
      const store = transaction.objectStore('meetings');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get meeting failed');
    });
  }

  async getAudio(id: string): Promise<Blob | undefined> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['audio'], 'readonly');
      const store = transaction.objectStore('audio');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result?.blob);
      request.onerror = () => reject('Get audio failed');
    });
  }

  async deleteMeeting(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings', 'audio'], 'readwrite');
      transaction.objectStore('meetings').delete(id);
      transaction.objectStore('audio').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  // --- Projects ---

  async addProject(project: Project): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readwrite');
      const store = transaction.objectStore('projects');
      store.put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Add project failed');
    });
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get projects failed');
    });
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readwrite');
      transaction.objectStore('projects').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  // --- Users ---

  async addUser(user: User): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readwrite');
      const store = transaction.objectStore('users');
      store.put(user);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Add user failed');
    });
  }

  async getUsers(): Promise<User[]> {
    return this.getAllUsers();
  }

  async getAllUsers(): Promise<User[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readonly');
      const store = transaction.objectStore('users');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get users failed');
    });
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readwrite');
      transaction.objectStore('users').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  // --- Emails ---

  async addEmail(email: EmailActivity): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readwrite');
      const store = transaction.objectStore('emails');
      store.put(email);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Add email failed');
    });
  }

  async getAllEmails(): Promise<EmailActivity[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get emails failed');
    });
  }

  async deleteEmail(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readwrite');
      transaction.objectStore('emails').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  // --- Messages ---

  async addMessage(message: Message): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      store.put(message);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Add message failed');
    });
  }

  async getAllMessages(): Promise<Message[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get messages failed');
    });
  }

  async deleteMessage(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      transaction.objectStore('messages').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }


  async addTicket(ticket: Ticket): Promise<void> {
    if (!this.db) await this.initDB();
    if (!ticket.id) ticket.id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['tickets'], 'readwrite');
      const store = transaction.objectStore('tickets');
      store.put(ticket);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Add ticket failed');
    });
  }

  async getAllTickets(): Promise<Ticket[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['tickets'], 'readonly');
      const store = transaction.objectStore('tickets');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get tickets failed');
    });
  }

  async deleteTicket(id: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['tickets'], 'readwrite');
      transaction.objectStore('tickets').delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  async emitArtifactCreated(projectId: string, artifact: any): Promise<void> {
    this.artifactCreated.next({ projectId, artifact });
  }

  // --- AI Jobs ---

  async createAIJob(meetingId: string): Promise<AIJob> {
    if (!this.db) await this.initDB();
    const job: AIJob = {
      id: crypto.randomUUID(),
      meetingId,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['ai_jobs'], 'readwrite');
      t.objectStore('ai_jobs').put(job);
      t.oncomplete = () => resolve(job);
      t.onerror = () => reject('Create job failed');
    });
  }

  async updateAIJob(id: string, updates: Partial<AIJob>): Promise<void> {
    if (!this.db) await this.initDB();
    const job = await this.getAIJob(id);
    if (!job) throw new Error('Job not found');
    const updated = { ...job, ...updates, updatedAt: new Date() };
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['ai_jobs'], 'readwrite');
      t.objectStore('ai_jobs').put(updated);
      t.oncomplete = () => resolve();
      t.onerror = () => reject('Update job failed');
    });
  }

  async getAIJob(id: string): Promise<AIJob | undefined> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['ai_jobs'], 'readonly');
      const request = t.objectStore('ai_jobs').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Get job failed');
    });
  }

  async getLatestJobForMeeting(meetingId: string): Promise<AIJob | undefined> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['ai_jobs'], 'readonly');
      const store = t.objectStore('ai_jobs');
      const index = store.index('meetingId');
      const request = index.getAll(meetingId);
      request.onsuccess = () => {
        const jobs = request.result as AIJob[];
        if (jobs.length === 0) resolve(undefined);
        else resolve(jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]);
      };
      request.onerror = () => reject('Get latest job failed');
    });
  }

  async heartbeat(id: string): Promise<void> {
    return this.updateAIJob(id, { heartbeat: new Date() });
  }

  async checkAndMarkStaleJobs(): Promise<void> {
    if (!this.db) await this.initDB();
    const now = new Date().getTime();
    const timeout = 60000; // 1 minute
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['ai_jobs'], 'readwrite');
      const store = t.objectStore('ai_jobs');
      const request = store.getAll();
      request.onsuccess = () => {
        const jobs = request.result as AIJob[];
        jobs.forEach(job => {
          if (job.status === 'running' && job.heartbeat) {
            if (now - job.heartbeat.getTime() > timeout) {
              job.status = 'failed';
              job.error = 'Job timed out (no heartbeat)';
              store.put(job);
            }
          }
        });
        resolve();
      };
      request.onerror = () => reject('Check stale jobs failed');
    });
  }

  // --- Speaker Mappings ---

  async saveSpeakerMapping(mapping: MeetingSpeakerMap): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['speaker_mappings'], 'readwrite');
      t.objectStore('speaker_mappings').put(mapping);
      t.oncomplete = () => resolve();
      t.onerror = () => reject('Save mapping failed');
    });
  }

  async getSpeakerMappings(meetingId: string): Promise<MeetingSpeakerMap[]> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['speaker_mappings'], 'readonly');
      const store = t.objectStore('speaker_mappings');
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result as MeetingSpeakerMap[];
        resolve(all.filter(m => m.meetingId === meetingId));
      };
      request.onerror = () => reject('Get mappings failed');
    });
  }

  // --- Recording Backups ---

  async saveRecordingBackup(meetingId: string, chunks: Blob[], isVideo?: boolean): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['recording_backups'], 'readwrite');
      t.objectStore('recording_backups').put({ meetingId, chunks, isVideo, updatedAt: new Date() });
      t.oncomplete = () => resolve();
      t.onerror = () => reject('Save backup failed');
    });
  }

  async deleteRecordingBackup(meetingId: string): Promise<void> {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const t = this.db!.transaction(['recording_backups'], 'readwrite');
      t.objectStore('recording_backups').delete(meetingId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject('Delete backup failed');
    });
  }

  async getFullBackup(): Promise<Blob> {
    if (!this.db) await this.initDB();
    
    const zip = new JSZip();

    const meetings = await this.getAllMeetings();
    const projects = await this.getAllProjects();
    const users = await this.getUsers();
    const emails = await this.getAllEmails();
    const messages = await this.getAllMessages();

    // 1. Create Metadata JSON
    const metadata = {
      appName: 'LoopMeet',
      version: 4,
      backupDate: new Date().toISOString(),
      meetings, // These are metadata only (no audioData)
      projects,
      users,
      emails,
      messages
    };
    
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 2. Add Media Files to ZIP
    const mediaFolder = zip.folder('media');
    if (mediaFolder) {
      for (const m of meetings) {
        const blob = await this.getAudio(m.id);
        if (blob) {
          mediaFolder.file(`${m.id}.webm`, blob);
        }
      }
    }

    // Using STORE compression for speed, as media is already compressed
    return await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE' 
    });
  }

  // Unified Import Entry Point
  async importData(file: File): Promise<void> {
    if (!this.db) await this.initDB();

    const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

    if (isJson) {
      const text = await file.text();
      return this.importLegacyJson(text);
    } else {
      try {
        const zip = await JSZip.loadAsync(file);
        return this.importZipData(zip);
      } catch (e) {
        // Fallback: It might be a JSON file misnamed or without correct MIME type
        try {
             const text = await file.text();
             // Simple check to see if it parses
             JSON.parse(text);
             return this.importLegacyJson(text);
        } catch (jsonErr) {
             throw new Error('Invalid file format. Please upload a valid .zip or .json backup.');
        }
      }
    }
  }

  private async importZipData(zip: JSZip): Promise<void> {
    // 1. Read Metadata
    const metadataFile = zip.file('metadata.json');
    if (!metadataFile) throw new Error('Invalid backup: metadata.json missing');
    
    const jsonStr = await metadataFile.async('string');
    const data = JSON.parse(jsonStr);

    const meetings = data.meetings || [];
    const projects = data.projects || [];
    const users = data.users || [];
    const emails = data.emails || [];
    const messages = data.messages || [];

    // 2. Restore Metadata First (Lightweight)
    await this.restoreMetadata(meetings, projects, users, emails, messages);

    // 3. Restore Media Files sequentially (Memory Safe)
    const mediaFolder = zip.folder('media');
    if (mediaFolder) {
        for (const m of meetings) {
            // Try matching ID with common extension
            const f = mediaFolder.file(`${m.id}.webm`);
            if (f) {
                // Extract single blob - kept in memory only for this iteration
                const blob = await f.async('blob');
                // Write to DB immediately and release ref
                await this.saveSingleAudio(m.id, blob);
            }
        }
    }
    console.log('Import completed.');
  }

  private async importLegacyJson(jsonStr: string): Promise<void> {
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch(e) {
        throw new Error('Invalid JSON format');
    }

    let meetings: any[] = [];
    let projects: any[] = [];
    let users: any[] = [];
    let emails: any[] = [];
    let messages: any[] = [];

    // Handle array root (legacy v1) or object root (v2+)
    if (Array.isArray(data)) {
        meetings = data;
    } else {
        meetings = data.meetings || [];
        projects = data.projects || [];
        users = data.users || [];
        emails = data.emails || [];
        messages = data.messages || [];
    }
    
    // Create clean metadata copies (without audioData strings)
    const cleanMeetings = meetings.map(m => {
        const copy = { ...m };
        delete copy.audioData;
        return copy;
    });

    // 1. Restore Metadata
    await this.restoreMetadata(cleanMeetings, projects, users, emails, messages);

    // 2. Restore Audio sequentially
    for (const item of meetings) {
        if (item.audioData) {
            try {
                // Decode base64 to blob
                const res = await fetch(item.audioData);
                const blob = await res.blob();
                // Save immediately
                await this.saveSingleAudio(item.id, blob);
            } catch (err) {
                console.error('Failed to decode audio for meeting ' + item.id, err);
            }
        }
    }
    console.log('Legacy import completed.');
  }

  // Helper to bulk save metadata
  private async restoreMetadata(
    meetings: any[], 
    projects: any[], 
    users: any[], 
    emails: any[],
    messages: any[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['meetings', 'projects', 'users', 'emails', 'messages'], 'readwrite');
      
      const mStore = transaction.objectStore('meetings');
      const pStore = transaction.objectStore('projects');
      const uStore = transaction.objectStore('users');
      const eStore = transaction.objectStore('emails');
      const msgStore = transaction.objectStore('messages');

      meetings.forEach(m => {
          if (m.date) m.date = new Date(m.date);
          mStore.put(m);
      });
      
      projects.forEach((p: any) => pStore.put(p));
      users.forEach((u: any) => uStore.put(u));
      emails.forEach((e: any) => {
           if (e.date) e.date = new Date(e.date);
           eStore.put(e);
      });
      messages.forEach((msg: any) => {
           if (msg.date) msg.date = new Date(msg.date);
           msgStore.put(msg);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject('Transaction error: ' + (e.target as any).error);
    });
  }

  // Helper to save single audio blob
  private async saveSingleAudio(id: string, blob: Blob): Promise<void> {
      return new Promise((resolve, reject) => {
          const t = this.db!.transaction(['audio'], 'readwrite');
          t.objectStore('audio').put({ id, blob });
          t.oncomplete = () => resolve();
          t.onerror = (e) => reject((e.target as any).error);
      });
  }
}
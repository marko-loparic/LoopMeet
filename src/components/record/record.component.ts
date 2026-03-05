import { Component, OnInit, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AudioService } from '../../services/audio.service';
import { DbService } from '../../services/db.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="bg-white shadow sm:rounded-lg overflow-hidden">
        
        <!-- Header -->
        <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 class="text-lg leading-6 font-medium text-gray-900">
            @if (audioService.isRecording()) {
              Recording in Progress...
            } @else {
              Setup Recording
            }
          </h3>
          <p class="mt-1 max-w-2xl text-sm text-gray-500">
             Select one or more audio sources. You can mix multiple microphones or loopback devices.
          </p>
        </div>

        <div class="p-6 space-y-6">
          
          <!-- Source Selection (Only if not recording) -->
          @if (!audioService.isRecording()) {
            <div class="space-y-6">
              
              <!-- Device List -->
              <div>
                <h4 class="text-sm font-medium text-gray-700 mb-2">Audio Inputs</h4>
                <div class="bg-gray-50 rounded-md border border-gray-200 divide-y divide-gray-200 max-h-60 overflow-y-auto">
                  @for (device of audioService.devices(); track device.deviceId) {
                    <div class="flex items-center p-3 hover:bg-gray-100 transition-colors">
                      <input 
                        type="checkbox" 
                        [id]="device.deviceId" 
                        [checked]="selectedDeviceIds().has(device.deviceId)"
                        (change)="toggleDevice(device.deviceId, $event)"
                        class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded">
                      <label [for]="device.deviceId" class="ml-3 block text-sm font-medium text-gray-700 w-full cursor-pointer">
                        {{ device.label }}
                      </label>
                    </div>
                  }
                  @if (audioService.devices().length === 0) {
                     <div class="p-4 text-sm text-gray-500 text-center">No audio devices found. Check permissions.</div>
                  }
                </div>
              </div>

              <!-- Input Meter for Setup -->
              @if (selectedDeviceIds().size > 0) {
                 <div class="bg-indigo-50 rounded-lg p-3 flex items-center gap-3">
                    <span class="text-xs font-bold text-indigo-800 uppercase tracking-wide w-20">Mic Level</span>
                    <div class="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                       <div class="h-full bg-indigo-500 transition-all duration-75 ease-out"
                            [style.width.%]="(audioService.monitorLevel() / 255) * 100">
                       </div>
                    </div>
                 </div>
              }

              <!-- System Audio / Screen Share -->
              <div class="flex flex-col space-y-4 pt-4 border-t border-gray-100">
                <!-- Main Toggle -->
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input id="system" type="checkbox" 
                      [checked]="useSystem" 
                      [disabled]="isTogglingSystem"
                      (change)="toggleSystem($event)"
                      class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed">
                  </div>
                  <div class="ml-3 text-sm w-full">
                    <label for="system" class="font-medium text-gray-700" [class.text-gray-400]="isTogglingSystem">Screen Share & System Audio</label>
                    <p class="text-gray-500">Record from browser tabs or screen share.</p>
                  </div>
                </div>

                <!-- Video Toggle (Only if System is active) -->
                @if (useSystem) {
                  <div class="ml-8 flex items-start">
                    <div class="flex items-center h-5">
                      <input id="video" type="checkbox" 
                        [(ngModel)]="useVideo"
                        class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded">
                    </div>
                    <div class="ml-3 text-sm">
                      <label for="video" class="font-medium text-gray-700">Include Video Recording</label>
                      <p class="text-gray-500 text-xs">If unchecked, only audio will be captured from the screen share.</p>
                    </div>
                  </div>
                
                  <!-- System Audio Meter -->
                  <div class="ml-8 mt-2 flex items-center gap-3 bg-gray-50 p-2 rounded border border-gray-100">
                     <span class="text-xs font-bold text-gray-500 uppercase tracking-wide w-20">Sys Level</span>
                     <div class="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500 transition-all duration-75 ease-out"
                             [style.width.%]="(audioService.systemMonitorLevel() / 255) * 100">
                        </div>
                     </div>
                  </div>
                }
              </div>

              <!-- Meeting Title Input -->
              <div class="pt-2">
                <label for="title" class="block text-sm font-medium text-gray-700">Meeting Title</label>
                <div class="mt-1">
                  <input type="text" id="title" [(ngModel)]="meetingTitle" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md" placeholder="Weekly Sync">
                </div>
              </div>
            </div>
          }

          <!-- Visualizer & Timer (Visible when recording) -->
          @if (audioService.isRecording()) {
             <div class="flex flex-col items-center justify-center space-y-6 py-8">
                <div class="text-5xl font-mono font-bold text-gray-800">
                  {{ formatTime(audioService.recordingTime()) }}
                </div>
                
                <div class="w-full max-w-md space-y-2">
                   <!-- Mic VU Meter -->
                   <div class="flex items-center gap-3">
                      <span class="text-xs font-bold text-gray-500 uppercase w-16 text-right">Mic</span>
                      <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                         <div class="h-full bg-indigo-500 transition-all duration-75 ease-out"
                              [style.width.%]="(audioService.micRecordingLevel() / 255) * 100">
                         </div>
                      </div>
                   </div>

                   <!-- System VU Meter (Only if system is recorded) -->
                   @if (useSystem) {
                     <div class="flex items-center gap-3">
                        <span class="text-xs font-bold text-gray-500 uppercase w-16 text-right">System</span>
                        <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                           <div class="h-full bg-blue-500 transition-all duration-75 ease-out"
                                [style.width.%]="(audioService.sysRecordingLevel() / 255) * 100">
                           </div>
                        </div>
                     </div>
                   }
                </div>

                <p class="text-sm text-gray-500 mt-2">
                  @if (useVideo) {
                    Recording Video & Audio...
                  } @else {
                    Recording Audio...
                  }
                </p>
             </div>
          }

          <!-- Actions -->
          <div class="pt-5 border-t border-gray-200 flex justify-end">
            @if (!audioService.isRecording() && !audioService.isFinalizing()) {
              <button (click)="startRecording()" [disabled]="selectedDeviceIds().size === 0 && !useSystem"
                class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                <svg class="-ml-1 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Start Recording
              </button>
            } @else if (audioService.isRecording() && !audioService.isFinalizing()) {
              <button (click)="stopRecording()"
                class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                <svg class="-ml-1 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop & Process
              </button>
            } @else if (audioService.isFinalizing()) {
              <button disabled
                class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-gray-400 cursor-not-allowed">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                Saving...
              </button>
            }
          </div>

          <!-- Loading State for processing -->
          @if (audioService.isFinalizing()) {
             <div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div class="bg-white p-6 rounded-lg shadow-xl text-center max-w-sm w-full">
                 <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                 <h3 class="text-lg font-medium text-gray-900">
                   {{ audioService.isFinalizing() ? 'Saving Recording...' : 'Processing Media...' }}
                 </h3>
                 @if (audioService.finalizeReason() && audioService.finalizeReason() !== 'manual_stop') {
                   <p class="text-sm text-amber-600 font-medium mt-1 mb-2">
                     Screen share ended automatically.
                   </p>
                 }
                 <p class="text-gray-500 text-sm">
                   Please don't close this tab while we save your meeting data.
                 </p>
               </div>
             </div>
          }
        </div>
      </div>
    </div>
  `
})
export class RecordComponent implements OnInit, OnDestroy {
  audioService = inject(AudioService);
  db = inject(DbService);
  router = inject(Router);

  useSystem = false;
  useVideo = false;
  selectedDeviceIds = signal<Set<string>>(new Set());
  meetingTitle = '';
  isTogglingSystem = false; // Local state to block UI during async setup
  private currentMeetingId: string | null = null;

  constructor() {
    effect(() => {
      const devices = this.audioService.devices();
      // Auto-select first device if nothing is selected and list is available
      if (devices.length > 0 && this.selectedDeviceIds().size === 0) {
        this.toggleDevice(devices[0].deviceId, { target: { checked: true } });
      }
    });

    effect(() => {
      const finalizedId = this.audioService.onRecordingFinalized();
      if (finalizedId && finalizedId === this.currentMeetingId) {
        this.router.navigate(['/meeting', finalizedId]);
        this.audioService.onRecordingFinalized.set(null);
      }
    });
  }

  ngOnInit() {
    this.audioService.getDevices();
    this.meetingTitle = `Meeting ${new Date().toLocaleDateString()}`;
  }

  ngOnDestroy() {
    this.audioService.stopMonitoring();
    if (!this.audioService.isRecording()) {
       this.audioService.stopSystemMonitor();
    }
    
    if (this.audioService.isRecording()) {
      this.audioService.stopRecording(false);
    }
  }

  toggleDevice(deviceId: string, event: any) {
    const isChecked = event.target.checked;
    
    this.selectedDeviceIds.update(currentSet => {
      const newSet = new Set(currentSet);
      if (isChecked) {
        newSet.add(deviceId);
      } else {
        newSet.delete(deviceId);
      }
      return newSet;
    });

    this.audioService.toggleMonitor(deviceId, isChecked);
  }

  async toggleSystem(event: any) {
    const isChecked = event.target.checked;
    this.isTogglingSystem = true;

    try {
       this.useSystem = isChecked;
       
       // Auto-enable video when screen share is enabled
       if (isChecked) {
         this.useVideo = true;
       }

       if (isChecked) {
         await this.audioService.toggleSystemMonitor(isChecked);
       } else {
         this.audioService.stopSystemMonitor();
       }
    } catch (e: any) {
       console.error(e);
       this.useSystem = false; // Revert toggle if failed
       this.useVideo = false;
       event.target.checked = false;
       
       // Only alert if it's not a user cancellation
       if (e.name !== 'NotAllowedError') {
          const msg = e.name === 'NotReadableError' 
            ? 'Could not access screen capture. Please try again or check system permissions.'
            : (e.message || 'Unknown error');
          alert(`Failed to setup system audio: ${msg}`);
       }
    } finally {
      this.isTogglingSystem = false;
    }
  }

  async startRecording() {
    const id = uuidv4();
    this.currentMeetingId = id;
    
    // Pre-create meeting record so we don't lose metadata if it crashes
    await this.db.saveMeeting({
      id,
      title: this.meetingTitle || 'Untitled Meeting',
      date: new Date(),
      duration: 0,
      participants: ['You'],
      isVideo: this.useVideo,
      tags: []
    }, new Blob([]));

    try {
      await this.audioService.startRecordingSession(
        id,
        Array.from(this.selectedDeviceIds()),
        this.useSystem,
        this.useVideo
      );
    } catch (e: any) {
      console.error('Failed to start recording', e);
      if (e.message === 'Permission to share screen was denied.') {
        this.useSystem = false;
        this.useVideo = false;
      } else {
        alert(`Failed to start recording: ${e.message || 'Unknown error'}`);
      }
      // Clean up the pre-created meeting if we failed to start
      await this.db.deleteMeeting(id);
      this.currentMeetingId = null;
    }
  }

  async stopRecording() {
    // We update the meeting title first in case they changed it while recording
    if (this.currentMeetingId) {
      const meeting = await this.db.getMeeting(this.currentMeetingId);
      if (meeting) {
        meeting.title = this.meetingTitle || 'Untitled Meeting';
        await this.db.updateMeeting(meeting);
      }
    }
    await this.audioService.finalizeRecording('manual_stop');
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
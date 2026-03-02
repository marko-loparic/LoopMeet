import { Injectable, signal, inject } from '@angular/core';
import { DbService } from './db.service';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private db = inject(DbService);
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  
  // Active Recording Streams
  private inputStreams: MediaStream[] = [];
  private sysStream: MediaStream | null = null;
  
  private chunks: Blob[] = [];
  private currentMeetingId: string | null = null;
  private isExpectedVideo = false;
  private backupInterval: any;

  devices = signal<AudioDevice[]>([]);
  isRecording = signal(false);
  isFinalizing = signal(false);
  finalizeReason = signal<string | null>(null);
  recordingTime = signal(0);
  onRecordingFinalized = signal<string | null>(null);
  
  // Levels
  volumeLevel = signal(0); // Master mix
  micRecordingLevel = signal(0);
  sysRecordingLevel = signal(0);
  
  // Monitoring (Pre-recording)
  monitorLevel = signal(0);
  systemMonitorLevel = signal(0); 
  
  private monitorContext: AudioContext | null = null;
  private monitorAnalyser: AnalyserNode | null = null;
  private systemMonitorAnalyser: AnalyserNode | null = null;
  
  private monitorStreamMap = new Map<string, MediaStream>(); // deviceId -> Stream
  private monitorFrame: any;
  private systemMonitorFrame: any;
  
  private timerInterval: any;
  
  // Analysers for recording
  private micAnalyser: AnalyserNode | null = null;
  private sysAnalyser: AnalyserNode | null = null;
  private animationFrame: any;
  
  // Guard to prevent concurrent system audio setup
  private isInitializingSystem = false;

  async getDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.warn('Microphone permission needed for enumeration');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 4)}` }));
    
    this.devices.set(audioInputs);
  }

  // --- Monitoring Logic ---

  private ensureMonitorContext() {
    if (!this.monitorContext || this.monitorContext.state === 'closed') {
      this.monitorContext = new AudioContext();
    }
  }

  async toggleMonitor(deviceId: string, enable: boolean) {
    if (enable) {
      if (this.monitorStreamMap.has(deviceId)) return;
      this.ensureMonitorContext();

      // Setup Mic Analyser if needed
      if (!this.monitorAnalyser) {
        this.monitorAnalyser = this.monitorContext!.createAnalyser();
        this.monitorAnalyser.fftSize = 256;
        this.visualizeMonitor();
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        });
        
        const source = this.monitorContext!.createMediaStreamSource(stream);
        source.connect(this.monitorAnalyser);
        
        this.monitorStreamMap.set(deviceId, stream);
      } catch (err) {
        console.error(`Failed to monitor device ${deviceId}`, err);
      }
    } else {
      const stream = this.monitorStreamMap.get(deviceId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        this.monitorStreamMap.delete(deviceId);
      }
    }
  }

  // --- System Audio Monitoring ---

  async toggleSystemMonitor(enable: boolean) {
    if (enable) {
      // If we are already running and active, do nothing
      if (this.sysStream && this.sysStream.active) return;
      
      // Guard against double invocation
      if (this.isInitializingSystem) return;
      this.isInitializingSystem = true;

      // Clean up any stale state before starting new
      this.stopSystemMonitor();
      
      // Note: We deliberately do NOT await a timeout here.
      // getDisplayMedia requires a transient user activation (gesture).
      // Awaiting a Promise/setTimeout can invalidate this gesture in some browsers.
      // We rely on synchronous cleanup of previous tracks.

      try {
        // Standard request for system audio/video
        this.sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, 
          audio: true
        });

        // We do NOT throw if audio is missing. We allow video-only screen sharing.
        const audioTrack = this.sysStream.getAudioTracks()[0];
        const videoTrack = this.sysStream.getVideoTracks()[0];

        // Handle stream ending (user stopped sharing via browser UI)
        if (videoTrack) {
          videoTrack.onended = () => {
             if (!this.isRecording()) this.stopSystemMonitor();
          };
        }
        
        if (audioTrack) {
          audioTrack.onended = () => {
             if (!this.isRecording()) this.stopSystemMonitor();
          };

          this.ensureMonitorContext();
          this.systemMonitorAnalyser = this.monitorContext!.createAnalyser();
          this.systemMonitorAnalyser.fftSize = 256;

          const source = this.monitorContext!.createMediaStreamSource(this.sysStream);
          source.connect(this.systemMonitorAnalyser);

          this.visualizeSystemMonitor();
        } else {
          console.warn('System audio not shared. Proceeding with video only.');
        }

      } catch (err) {
        console.error('System monitor setup failed', err);
        // Ensure we clean up any partial stream
        this.stopSystemMonitor(); 
        throw err;
      } finally {
        this.isInitializingSystem = false;
      }
    } else {
      this.stopSystemMonitor();
    }
  }

  stopSystemMonitor() {
    if (this.systemMonitorFrame) {
        cancelAnimationFrame(this.systemMonitorFrame);
        this.systemMonitorFrame = null;
    }
    
    if (this.sysStream) {
      try {
        this.sysStream.getTracks().forEach(t => {
            t.stop();
            // Explicitly remove listeners to prevent memory leaks or ghost calls
            t.onended = null;
        });
      } catch (e) {
        console.warn('Error stopping system tracks', e);
      }
      this.sysStream = null;
    }
    this.systemMonitorAnalyser = null;
    this.systemMonitorLevel.set(0);
  }

  stopMonitoring(preserveSystemStream = false) {
    if (this.monitorFrame) cancelAnimationFrame(this.monitorFrame);
    if (this.systemMonitorFrame) cancelAnimationFrame(this.systemMonitorFrame);
    
    // Stop mic streams
    this.monitorStreamMap.forEach(stream => {
      stream.getTracks().forEach(t => t.stop());
    });
    this.monitorStreamMap.clear();

    // Close Monitor Context (stops audio processing for monitor)
    this.monitorContext?.close();
    this.monitorContext = null;
    this.monitorAnalyser = null;
    this.monitorLevel.set(0);
    this.systemMonitorLevel.set(0); // Reset UI level for monitor
    this.systemMonitorAnalyser = null;

    // IMPORTANT: If we are about to record system audio, we MUST NOT stop the tracks
    if (!preserveSystemStream && this.sysStream) {
      this.sysStream.getTracks().forEach(t => t.stop());
      this.sysStream = null;
    }
    // If preserving, we leave this.sysStream alone (it stays active for recording)
  }

  private visualizeMonitor() {
    if (!this.monitorAnalyser) return;
    const bufferLength = this.monitorAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (!this.monitorAnalyser) return;
      this.monitorAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      this.monitorLevel.set(sum / bufferLength); 
      this.monitorFrame = requestAnimationFrame(update);
    };
    update();
  }

  private visualizeSystemMonitor() {
    // If we have no analyser (e.g. video only), just clear level
    if (!this.systemMonitorAnalyser) {
        this.systemMonitorLevel.set(0);
        return;
    }

    const bufferLength = this.systemMonitorAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      // If stream ended or analyser gone, stop
      if (!this.systemMonitorAnalyser || !this.sysStream?.active) {
        this.systemMonitorLevel.set(0);
        return;
      }
      this.systemMonitorAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      this.systemMonitorLevel.set(sum / bufferLength);
      this.systemMonitorFrame = requestAnimationFrame(update);
    };
    update();
  }

  // --- Recording Logic ---

  async startRecordingSession(meetingId: string, micDeviceIds: string[], includeSystemAudio: boolean, recordVideo: boolean): Promise<void> {
    this.currentMeetingId = meetingId;
    this.isExpectedVideo = recordVideo;

    // 1. Update Meeting Status
    const meeting = await this.db.getMeeting(meetingId);
    if (meeting) {
      meeting.media_status = 'recording';
      await this.db.updateMeeting(meeting);
    }
    
    // 1. Prepare System Stream if needed (check existing)
    // We pass true to stopMonitoring so it doesn't kill the existing sysStream
    const existingSysStream = (includeSystemAudio && this.sysStream?.active) ? this.sysStream : null;
    
    this.stopMonitoring(!!existingSysStream); 
    
    this.audioContext = new AudioContext();
    this.streamDestination = this.audioContext.createMediaStreamDestination();
    
    // Initialize Analysers
    this.micAnalyser = this.audioContext.createAnalyser();
    this.micAnalyser.fftSize = 256;
    
    // We only create sysAnalyser if we actually have system audio later
    this.sysAnalyser = this.audioContext.createAnalyser();
    this.sysAnalyser.fftSize = 256;

    this.inputStreams = [];

    // 2. Mix Mics
    for (const id of micDeviceIds) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true }
        });
        this.inputStreams.push(stream);
        
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.streamDestination); // To Output
        source.connect(this.micAnalyser); // To Mic Meter
      } catch (e) {
        console.error(`Failed to add mic ${id}`, e);
      }
    }

    // 3. System Audio (and Video if requested)
    let videoTrack: MediaStreamTrack | null = null;

    if (includeSystemAudio || recordVideo) {
      let streamToUse = existingSysStream;
      
      // If we didn't have it (skipped setup), try to get it now
      if (!streamToUse) {
        try {
          streamToUse = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: includeSystemAudio
          });
        } catch (err) {
          console.error('System audio/video request failed', err);
          throw new Error('Could not start video source. Please ensure you granted permission to share your screen.');
        }
      }

      if (streamToUse) {
        this.sysStream = streamToUse; // ensure it's tracked
        
        // Failsafe: detect if stream ends unexpectedly
        streamToUse.getTracks().forEach(track => {
          track.onended = () => {
            console.warn(`Track ${track.kind} ended unexpectedly. Finalizing recording...`);
            this.finalizeRecording('display_track_ended');
          };
          if ('oninactive' in track) {
            (track as any).oninactive = () => {
              console.warn(`Track ${track.kind} inactive. Finalizing recording...`);
              this.finalizeRecording('display_track_inactive');
            };
          }
        });

        (streamToUse as any).oninactive = () => {
          console.warn(`Display stream inactive. Finalizing recording...`);
          this.finalizeRecording('display_stream_inactive');
        };
        
        if (includeSystemAudio) {
          const sysAudioTrack = streamToUse.getAudioTracks()[0];
          if (sysAudioTrack) {
            // Mix audio
            const sysSource = this.audioContext.createMediaStreamSource(new MediaStream([sysAudioTrack]));
            sysSource.connect(this.streamDestination); // To Output
            if (this.sysAnalyser) {
              sysSource.connect(this.sysAnalyser); // To Sys Meter
            }
          }
        }

        if (recordVideo) {
          videoTrack = streamToUse.getVideoTracks()[0];
        }
      }
    }

    this.chunks = [];
    
    let finalStream = this.streamDestination.stream;
    const mimeType = this.getSupportedMimeType(recordVideo && !!videoTrack);

    // If we have video, mix the audio destination with the video track
    if (recordVideo && videoTrack) {
      // Audio track from mixer + Video track from screen
      const mixedAudioTrack = this.streamDestination.stream.getAudioTracks()[0];
      finalStream = new MediaStream([videoTrack, mixedAudioTrack]);
    }

    console.log(`[AudioService] Starting MediaRecorder with mimeType: ${mimeType}`);
    this.mediaRecorder = new MediaRecorder(finalStream, { mimeType });
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(1000); 
    
    // Backup chunks every 10 seconds
    this.backupInterval = setInterval(() => {
      if (this.currentMeetingId && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.requestData();
      }
      if (this.currentMeetingId && this.chunks.length > 0) {
        this.db.saveRecordingBackup(this.currentMeetingId, [...this.chunks], this.isExpectedVideo);
      }
    }, 10000);

    // IMPORTANT: Set isRecording to true BEFORE starting visualization loop
    this.isRecording.set(true);
    this.isFinalizing.set(false);
    this.finalizeReason.set(null);
    
    // Now start the visualization loop
    this.visualizeRecording();
    
    this.recordingTime.set(0);
    this.timerInterval = setInterval(() => {
      this.recordingTime.update(t => t + 1);
    }, 1000);

    // Tab close protection
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.isRecording()) {
      // We can't await here, but we can try to trigger finalization
      // Most browsers won't allow async work on unload, but we have the backup in IndexedDB
      this.finalizeRecording('tab_close');
      
      // Standard message to warn user
      event.preventDefault();
      event.returnValue = '';
    }
  };

  stopRecording(isExpectedVideo: boolean): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: isExpectedVideo ? 'video/webm' : 'audio/webm' }));
        return;
      }

      // Fallback timeout in case onstop doesn't fire
      const fallbackTimeout = setTimeout(() => {
        console.warn('MediaRecorder onstop timeout. Resolving with current chunks.');
        const type = isExpectedVideo ? 'video/webm' : 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.cleanup();
        resolve(blob);
      }, 5000);

      this.mediaRecorder.onstop = () => {
        clearTimeout(fallbackTimeout);
        const type = isExpectedVideo ? 'video/webm' : 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.cleanup();
        resolve(blob);
      };

      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.requestData();
      }
      this.mediaRecorder.stop();
      this.isRecording.set(false);
      clearInterval(this.timerInterval);
      clearInterval(this.backupInterval);
    });
  }

  /**
   * Failsafe finalization called when a stream ends unexpectedly.
   */
  async finalizeRecording(reason: string) {
    if (!this.isRecording() || this.isFinalizing()) return;
    this.isFinalizing.set(true);
    this.finalizeReason.set(reason);
    console.log(`Finalizing recording due to: ${reason}`);
    
    const meetingId = this.currentMeetingId;
    const isVideo = this.isExpectedVideo;
    const duration = this.recordingTime();
    
    const blob = await this.stopRecording(isVideo);
    
    if (meetingId) {
      // Update status to finalizing
      let meeting = await this.db.getMeeting(meetingId);
      if (meeting) {
        meeting.media_status = 'finalizing';
        await this.db.updateMeeting(meeting);
      }

      if (blob.size > 50000) { // MIN_BYTES check
        try {
          // UPLOAD LOGIC HERE
          console.log('Uploading media...');
          meeting = await this.db.getMeeting(meetingId);
          if (meeting) {
            meeting.media_status = 'uploaded';
            meeting.media_bytes = blob.size;
            meeting.media_mime = blob.type;
            meeting.duration = duration;
            // meeting.audioBlob = blob; // Removed to avoid double storage in meetings store
            await this.db.saveMeeting(meeting, blob);
          }
          
          await this.db.deleteRecordingBackup(meetingId);
          this.onRecordingFinalized.set(meetingId);
        } catch (e) {
          console.error('Failed to finalize recording in DB', e);
          meeting = await this.db.getMeeting(meetingId);
          if (meeting) {
            meeting.media_status = 'upload_failed';
            await this.db.updateMeeting(meeting);
          }
        }
      } else {
        console.warn('Recording blob is too small. Deleting pre-created meeting.');
        await this.db.deleteMeeting(meetingId);
        await this.db.deleteRecordingBackup(meetingId);
        if (reason !== 'manual_stop') {
          alert('Recording ended, but no audio/video data was captured.');
        }
      }
    }
    
    this.isFinalizing.set(false);
  }

  private getSupportedMimeType(isVideo: boolean): string {
    const videoTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    const audioTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg',
      'audio/mp4'
    ];

    const types = isVideo ? videoTypes : audioTypes;
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return isVideo ? 'video/webm' : 'audio/webm';
  }

  private cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.inputStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
    this.inputStreams = [];
    
    if (this.sysStream) {
      this.sysStream.getTracks().forEach(t => t.stop());
      this.sysStream = null;
    }

    this.audioContext?.close();
    cancelAnimationFrame(this.animationFrame);
    
    this.volumeLevel.set(0);
    this.micRecordingLevel.set(0);
    this.sysRecordingLevel.set(0);
    
    this.micAnalyser = null;
    this.sysAnalyser = null;
  }

  private visualizeRecording() {
    // Determine buffer lengths based on actual analysers
    const micLen = this.micAnalyser ? this.micAnalyser.frequencyBinCount : 0;
    const sysLen = this.sysAnalyser ? this.sysAnalyser.frequencyBinCount : 0;

    const micData = new Uint8Array(micLen);
    const sysData = new Uint8Array(sysLen);

    const update = () => {
      // Must return if recording stopped
      if (!this.isRecording()) return;
      
      // Update Mic Level
      if (this.micAnalyser && micLen > 0) {
        this.micAnalyser.getByteFrequencyData(micData);
        let sum = 0;
        for (let i = 0; i < micLen; i++) sum += micData[i];
        this.micRecordingLevel.set(sum / micLen);
      }

      // Update Sys Level
      if (this.sysAnalyser && sysLen > 0) {
        // sysAnalyser might not be connected to anything if no system audio
        this.sysAnalyser.getByteFrequencyData(sysData);
        let sum = 0;
        for (let i = 0; i < sysLen; i++) sum += sysData[i];
        this.sysRecordingLevel.set(sum / sysLen);
      }

      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
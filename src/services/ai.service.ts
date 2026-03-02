import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY']! });
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    // Convert blob to base64
    const base64Data = await this.blobToBase64(audioBlob);
    
    // Gemini 3 Flash Preview for audio ingestion
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Data
            }
          },
          {
            text: `Please transcribe this audio meeting accurately. 
            Format the output with timestamps and speaker labels like this:
            [MM:SS] Speaker Name: The text spoken.
            
            Identify speakers as Speaker A, Speaker B, etc. if names are unknown.
            Do not include any other text than the transcript.`
          }
        ]
      }
    });

    return response.text || 'Transcription failed.';
  }

  async generateSummary(transcript: string): Promise<any> {
    // Truncate transcript if too long to avoid output overflow
    const truncatedTranscript = transcript.length > 150000 ? transcript.substring(0, 150000) + "... [truncated]" : transcript;

    const prompt = `
      Based on the following meeting transcript, generate a structured summary JSON.
      
      Also, analyze the transcript to calculate how much each speaker talked (based on word count or lines).
      
      Transcript:
      ${truncatedTranscript}

      Required JSON Structure:
      {
        "executiveSummary": "string",
        "detailedSummary": "string",
        "keyDecisions": ["string"],
        "actionItems": ["string"],
        "risks": ["string"],
        "topics": [{ "timestamp": "string", "topic": "string" }],
        "nextSteps": ["string"],
        "speakerStats": [{ "speaker": "string", "percentage": number, "style": "string (e.g. Concise, Detailed)" }]
      }
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            detailedSummary: { type: Type.STRING },
            keyDecisions: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
            risks: { type: Type.ARRAY, items: { type: Type.STRING } },
            topics: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { timestamp: { type: Type.STRING }, topic: { type: Type.STRING } } 
              } 
            },
            nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            speakerStats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  percentage: { type: Type.NUMBER, description: "Percentage of total conversation (0-100)" },
                  style: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    try {
      return this.safeParseJson(response.text);
    } catch (e) {
      console.error('Failed to parse summary JSON', e);
      return null;
    }
  }

  async extractTickets(transcript: string): Promise<any[]> {
    // Truncate transcript for ticket extraction if too long to avoid output overflow
    const truncatedTranscript = transcript.length > 100000 ? transcript.substring(0, 100000) + "... [truncated]" : transcript;

    const prompt = `
      Extract tickets from this meeting transcript.
      Types: Requirement, Improvement, Bug, Task.
      
      Transcript:
      ${truncatedTranscript}
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['Requirement', 'Improvement', 'Bug', 'Task'] },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              priority: { type: Type.STRING, enum: ['P0', 'P1', 'P2', 'P3'] },
              owner: { type: Type.STRING },
              status: { type: Type.STRING, enum: ['proposed', 'confirmed', 'dismissed'] }
            }
          }
        }
      }
    });

    try {
      return this.safeParseJson(response.text) || [];
    } catch (e) {
      console.error('Failed to parse tickets JSON', e);
      return [];
    }
  }

  async chat(history: any[], newMessage: string, context: string): Promise<string> {
    const chat = this.ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `You are a helpful meeting assistant. 
        Answer questions based ONLY on the provided meeting transcript context.
        If the answer is not in the context, say "This was not discussed in the meeting."
        
        Context:
        ${context}`
      },
      history: history
    });

    const response = await chat.sendMessage({ message: newMessage });
    return response.text;
  }

  async chatWithStoryline(context: any): Promise<any> {
    const prompt = `
      You are the Storyline Assistant for LoopMeet.
      
      🚨 CRITICAL RULES:
      1. AI RESPONDS ONLY IF EXPLICITLY MENTIONED ("@AI").
         - If message does NOT contain "@AI":
           -> Post message only.
           -> assistant_message = "" (Empty string).
           -> Do NOT generate conversational reply.
         - If message contains "@AI":
           -> Post user message (without "@AI").
           -> Generate helpful AI reply in assistant_message.
           -> assistant_message = "Your helpful response here."

      2. HASHTAG RESOLUTION:
         - Users can reference artifacts: #meeting:id, #email:id, #epic:id, #story:id, #task:id.
         - Or generic: #title-fragment.
         - If title fragment -> search artifact_index_summary.
         - If multiple matches -> return disambiguation.
         - If no match -> inform user (only if @AI used, otherwise just post as text).

      3. THREAD RULES:
         - If parent_message_id provided -> reply_message.

      4. OUTPUT FORMAT (Strict JSON):
      {
        "assistant_message": "String (empty if no @AI)",
        "actions": [
          {
            "tool": "storyline.post_message",
            "args": { 
              "content": "Cleaned user message (remove @AI)",
              "artifacts": [ { "type": "meeting", "id": "...", "label": "..." } ]
            }
          }
        ],
        "ui_hints": {
          "highlight_artifact_ids": [],
          "disambiguation": null
        }
      }

      AVAILABLE TOOLS:
      - storyline.post_message (Use this to send your reply or system notifications. Do NOT repost the user's message.)
      - storyline.reply_message
      - storyline.react
      - project.search_artifacts
      - project.create_artifact

      RUNTIME CONTEXT:
      ${JSON.stringify(context, null, 2)}
      
      USER MESSAGE:
      ${context.user_message}
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    try {
      return this.safeParseJson(response.text);
    } catch (e) {
      console.error('Failed to parse Storyline JSON', e);
      return { assistant_message: "", actions: [] };
    }
  }

  private safeParseJson(text: string | undefined): any {
    if (!text) return null;
    
    let cleaned = text.trim();
    
    // Remove markdown code blocks if present
    if (cleaned.includes('```')) {
      const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleaned = match[1];
      }
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn('JSON parse failed, attempting manual repair...', e);
      
      // Attempt to fix common truncation issues
      try {
        return this.repairJson(cleaned);
      } catch (repairError) {
        console.error('JSON repair failed', repairError);
        
        // Last resort: find the last valid object/array boundary if it's a list
        try {
           if (cleaned.startsWith('[')) {
             const lastValidIndex = cleaned.lastIndexOf('}');
             if (lastValidIndex !== -1) {
               return JSON.parse(cleaned.substring(0, lastValidIndex + 1) + ']');
             }
           }
        } catch (lastResortError) {
           console.error('Last resort JSON parsing failed', lastResortError);
        }
        
        return null;
      }
    }
  }

  private repairJson(json: string): any {
    let repaired = json.trim();
    
    // Count brackets
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '"' && !escaped) inString = !inString;
      if (!inString) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
      escaped = char === '\\' && !escaped;
    }
    
    if (inString) repaired += '"';
    
    // If it ends with a comma, remove it
    repaired = repaired.replace(/,\s*$/, '');
    
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    
    return JSON.parse(repaired);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
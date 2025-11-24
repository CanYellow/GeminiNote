import { GoogleGenAI } from "@google/genai";
import { GenerationRequest, GenerationResponse } from "./types";
import { Notice } from "obsidian";

export class GeminiService {
    private apiKey: string;
    private apiHost: string;
    private modelName: string;
    private metaPrompt: string;

    constructor(apiKey: string, apiHost: string, modelName: string, metaPrompt: string) {
        this.apiKey = apiKey;
        this.apiHost = apiHost;
        this.modelName = modelName;
        this.metaPrompt = metaPrompt;
    }

    async generateNote(request: GenerationRequest): Promise<GenerationResponse> {
        if (!this.apiKey) {
            throw new Error("API Key not set");
        }

        const payload = {
            userInstruction: request.instructionContent,
            selectedText: request.selectedText,
            parentNoteContent: request.contextType === 'selection_and_full_note' ? request.parentNoteContent : undefined,
            parentNoteTitle: request.parentNoteTitle
        };

        const fullPrompt = `${this.metaPrompt}\n\nInput Data:\n${JSON.stringify(payload, null, 2)}`;

        // LOGIC BRANCH: Custom Host vs Default SDK
        if (this.apiHost && this.apiHost.trim() !== '') {
            return this.generateWithCustomHost(fullPrompt);
        } else {
            return this.generateWithSdk(fullPrompt);
        }
    }

    private async generateWithSdk(prompt: string): Promise<GenerationResponse> {
        const ai = new GoogleGenAI({ apiKey: this.apiKey });
        try {
            const response = await ai.models.generateContent({
                model: this.modelName,
                contents: prompt
            });
            const responseText = response.text || "";
            return this.parseResponse(responseText, ""); // passing empty originalSelection as fallback isn't needed here usually
        } catch (error) {
            console.error("Gemini SDK Error:", error);
            throw new Error(`Gemini SDK Error: ${error.message || error}`);
        }
    }

    private async generateWithCustomHost(prompt: string): Promise<GenerationResponse> {
        // 1. Sanitize Host URL
        let host = this.apiHost.trim();
        // Fix common typo: https:/gemini -> https://gemini
        if (host.startsWith("https:/") && !host.startsWith("https://")) {
            host = host.replace("https:/", "https://");
        }
        // Remove trailing slash
        if (host.endsWith("/")) {
            host = host.slice(0, -1);
        }

        // 2. Construct URL matching the user's working example structure
        // Pattern: ${API_HOST}/v1beta/models/${model}:generateContent?key=${API_KEY}
        const url = `${host}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

        // 3. Construct Body
        const body = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let errorMsg = `HTTP Error ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.error && errData.error.message) {
                        errorMsg += `: ${errData.error.message}`;
                    }
                } catch (e) { /* ignore json parse error */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            
            // Extract text from Gemini REST response structure
            // { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) {
                throw new Error("Empty response from API");
            }

            return this.parseResponse(responseText, "");

        } catch (error) {
            console.error("Custom Host API Error:", error);
            throw new Error(`API Request Failed: ${error.message}`);
        }
    }

    private parseResponse(rawResponse: string, originalSelection: string): GenerationResponse {
        let textToParse = rawResponse.trim();

        // Tier 1: Strip Markdown Code Blocks
        const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
        const match = textToParse.match(codeBlockRegex);
        if (match) {
            textToParse = match[1].trim();
        }

        // Tier 2: Direct JSON Parse
        try {
            const parsed = JSON.parse(textToParse);
            if (this.isValidResponse(parsed)) {
                return { title: parsed.title, content: parsed.content, isFallback: false };
            }
        } catch (e) { }

        // Tier 3: Resilient JSON Extraction via Regex
        try {
            const firstBrace = rawResponse.indexOf('{');
            const lastBrace = rawResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonSubstring = rawResponse.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(jsonSubstring);
                if (this.isValidResponse(parsed)) {
                    return { title: parsed.title, content: parsed.content, isFallback: false };
                }
            }
        } catch (e) { }

        // Tier 4: Raw Text Fallback
        // Note: originalSelection might not be available in all paths, but we handle it safely in the main plugin flow 
        // effectively by passing empty string here and relying on sanitization if needed, 
        // OR we can just return the raw text and let the main loop handle the title if it's missing.
        // However, for safety, we return a generic title here if extraction failed.
        return {
            title: "Untitled Gemini Note",
            content: rawResponse,
            isFallback: true
        };
    }

    private isValidResponse(obj: any): boolean {
        return obj && typeof obj.title === 'string' && obj.title.trim() !== '' && 
               typeof obj.content === 'string' && obj.content.trim() !== '';
    }
}
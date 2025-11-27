import { GoogleGenAI } from "@google/genai";
import { requestUrl } from "obsidian";
import { GenerationRequest, GenerationResponse, OutputAction } from "./types";

export class GeminiService {
    private apiKey: string;
    private apiHost: string;
    private modelName: string;
    private createNoteMetaPrompt: string;
    private inPlaceMetaPrompt: string;

    constructor(
        apiKey: string, 
        apiHost: string, 
        modelName: string, 
        createNoteMetaPrompt: string,
        inPlaceMetaPrompt: string
    ) {
        this.apiKey = apiKey;
        this.apiHost = apiHost;
        this.modelName = modelName;
        this.createNoteMetaPrompt = createNoteMetaPrompt;
        this.inPlaceMetaPrompt = inPlaceMetaPrompt;
    }

    async generateNote(request: GenerationRequest): Promise<GenerationResponse> {
        if (!this.apiKey) {
            throw new Error("API Key not set");
        }

        let fullPrompt = "";
        const isCreateNote = request.outputAction === 'create_note';
        const hasBackground = request.backgroundContext && request.backgroundContext.trim().length > 0;

        if (isCreateNote) {
            // Strategy: Structured JSON for new file
            const payload = {
                userInstruction: request.instructionContent,
                selectedText: request.selectedText,
                parentNoteContent: request.contextType === 'selection_and_full_note' ? request.parentNoteContent : undefined,
                parentNoteTitle: request.parentNoteTitle,
                backgroundReferences: hasBackground ? request.backgroundContext : undefined
            };
            
            // Inject instruction about references into the prompt string if they exist
            let promptIntro = this.createNoteMetaPrompt;
            if (hasBackground) {
                promptIntro += "\n\nIMPORTANT: Use the provided 'backgroundReferences' as source material to enrich the content and ensure factual accuracy.";
            }

            fullPrompt = `${promptIntro}\n\nInput Data:\n${JSON.stringify(payload, null, 2)}`;
        } else {
            // Strategy: Fluent Text for In-Place
            let backgroundSection = "";
            if (hasBackground) {
                backgroundSection = `
---
BACKGROUND REFERENCE MATERIALS (Use for facts/context, but prioritize current document flow):
${request.backgroundContext}
`;
            }

            fullPrompt = `${this.inPlaceMetaPrompt}
            
---
USER INSTRUCTION (Rule to follow):
${request.instructionContent}

${backgroundSection}

---
EXISTING TEXT BEFORE SELECTION (Context):
...${request.contextBefore}

---
EXISTING TEXT AFTER SELECTION (Context):
${request.contextAfter}...

---
USER SELECTED TEXT (Input to process):
${request.selectedText}
`;
        }

        // LOGIC BRANCH: Custom Host vs Default SDK
        let responseText = "";
        if (this.apiHost && this.apiHost.trim() !== '') {
            responseText = await this.generateWithCustomHost(fullPrompt);
        } else {
            responseText = await this.generateWithSdk(fullPrompt);
        }

        return this.parseResponse(responseText, isCreateNote);
    }

    private async generateWithSdk(prompt: string): Promise<string> {
        const ai = new GoogleGenAI({ apiKey: this.apiKey });
        try {
            const response = await ai.models.generateContent({
                model: this.modelName,
                contents: prompt
            });
            return response.text || "";
        } catch (error) {
            console.error("Gemini SDK Error:", error);
            throw new Error(`Gemini SDK Error: ${error.message || error}`);
        }
    }

    private async generateWithCustomHost(prompt: string): Promise<string> {
        let host = this.apiHost.trim();
        if (host.startsWith("https:/") && !host.startsWith("https://")) {
            host = host.replace("https:/", "https://");
        }
        if (host.endsWith("/")) {
            host = host.slice(0, -1);
        }

        const url = `${host}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
        const body = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        try {
            // Use Obsidian's requestUrl to bypass CORS
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.status >= 400) {
                throw new Error(`HTTP Error ${response.status}: ${JSON.stringify(response.json)}`);
            }

            const data = response.json;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) throw new Error("Empty response from API");
            return text;

        } catch (error) {
            console.error("Custom Host API Error:", error);
            throw new Error(`API Request Failed: ${error.message || error}`);
        }
    }

    private parseResponse(rawResponse: string, expectJson: boolean): GenerationResponse {
        const textToParse = rawResponse.trim();

        if (!expectJson) {
            const codeBlockRegex = /^```(?:\w+)?\s*([\s\S]*?)\s*```$/i;
            const match = textToParse.match(codeBlockRegex);
            return {
                title: "",
                content: match ? match[1].trim() : textToParse,
                isFallback: false
            };
        }

        let cleanJson = textToParse;
        const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
        const match = textToParse.match(codeBlockRegex);
        if (match) {
            cleanJson = match[1].trim();
        }

        try {
            const parsed = JSON.parse(cleanJson);
            if (this.isValidResponse(parsed)) {
                return { 
                    title: parsed.title, 
                    content: parsed.content, 
                    anchorLabel: parsed.anchorLabel,
                    isFallback: false 
                };
            }
        } catch (e) { }

        try {
            const firstBrace = rawResponse.indexOf('{');
            const lastBrace = rawResponse.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonSubstring = rawResponse.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(jsonSubstring);
                if (this.isValidResponse(parsed)) {
                    return { 
                        title: parsed.title, 
                        content: parsed.content, 
                        anchorLabel: parsed.anchorLabel,
                        isFallback: false 
                    };
                }
            }
        } catch (e) { }

        return {
            title: "Untitled Gemini Note",
            content: rawResponse,
            isFallback: true
        };
    }

    private isValidResponse(obj: any): boolean {
        return obj && 
               typeof obj.title === 'string' && 
               typeof obj.content === 'string';
    }
}
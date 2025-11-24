
export type OutputAction = 'create_note' | 'replace_selection' | 'insert_after';

export interface GeminiNoteSettings {
    apiKey: string;
    apiHost: string; // Custom API Host (Base URL)
    modelName: string;
    instructionsFolder: string;
    defaultContext: 'selection_only' | 'selection_and_full_note';
    defaultSaveLocation: string;
    defaultOutputAction: OutputAction;
    metaPrompt: string;
}

export const DEFAULT_SETTINGS: GeminiNoteSettings = {
    apiKey: '',
    apiHost: '',
    modelName: 'gemini-1.5-pro-latest',
    instructionsFolder: 'Templates/Instructions',
    defaultContext: 'selection_only',
    defaultSaveLocation: '',
    defaultOutputAction: 'create_note',
    metaPrompt: `You are an assistant integrated into an Obsidian note-taking app. 
Your task is to process the user's request and provide a structured JSON response with a "title" and "content" for a new note. 
Output ONLY the raw JSON string. 
Do not wrap it in markdown code blocks (like \`\`\`json). 
Do not include any other text, explanations, or formatting.`
};

export interface GenerationRequest {
    instructionPath: string;
    instructionContent: string;
    contextType: 'selection_only' | 'selection_and_full_note';
    saveLocation: string;
    selectedText: string;
    parentNoteContent: string;
    parentNoteTitle: string;
}

export interface GenerationResponse {
    title: string;
    content: string;
    isFallback: boolean;
}
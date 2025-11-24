
export type OutputAction = 'create_note' | 'replace_selection' | 'insert_after';

export interface GeminiNoteSettings {
    apiKey: string;
    apiHost: string;
    modelName: string;
    instructionsFolder: string;
    defaultContext: 'selection_only' | 'selection_and_full_note';
    defaultSaveLocation: string;
    defaultOutputAction: OutputAction;
    createNoteMetaPrompt: string;
    inPlaceMetaPrompt: string;
}

export const DEFAULT_SETTINGS: GeminiNoteSettings = {
    apiKey: '',
    apiHost: '',
    modelName: 'gemini-1.5-pro-latest',
    instructionsFolder: 'Templates/Instructions',
    defaultContext: 'selection_only',
    defaultSaveLocation: '',
    defaultOutputAction: 'create_note',
    createNoteMetaPrompt: `You are an assistant integrated into an Obsidian note-taking app. 
Your task is to process the user's request and provide a structured JSON response for a NEW NOTE.
Return a JSON object with:
- "title": A concise filename.
- "content": The encyclopedic or detailed content of the note.
- "anchorLabel": A short, descriptive phrase (2-5 words) summarizing the user's selected text. This will be used as the link text in the parent note.
Output ONLY the raw JSON string. Do not wrap it in markdown code blocks.`,
    inPlaceMetaPrompt: `You are an expert editor and co-author. 
Your task is to generate text that fits seamlessly into an existing document.
You will be provided with the text BEFORE the selection, the SELECTION itself, and the text AFTER.
Based on the user's instruction, rewrite or expand the SELECTION so it flows naturally between the BEFORE and AFTER context.
Output ONLY the new text content. Do not output JSON. Do not include conversational filler.`
};

export interface GenerationRequest {
    instructionPath: string;
    instructionContent: string;
    contextType: 'selection_only' | 'selection_and_full_note';
    saveLocation: string;
    selectedText: string;
    contextBefore: string; // Text preceding the selection
    contextAfter: string;  // Text following the selection
    parentNoteContent: string;
    parentNoteTitle: string;
    outputAction: OutputAction;
}

export interface GenerationResponse {
    title: string;
    content: string;
    anchorLabel?: string; // Optional field for smarter linking
    isFallback: boolean;
}

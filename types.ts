
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
    createNoteMetaPrompt: `You are an expert Knowledge Manager and Obsidian Assistant.
Your goal is to process the user's input and generate a structured JSON response for a NEW NOTE.

### INPUT DATA:
1. **userInstruction**: The specific task (e.g., "Summarize", "Explain").
2. **selectedText**: The core subject.
3. **parentNoteContent**: Context from the source note.
4. **backgroundReferences** (Optional): Additional factual context. Use this to enrich the content.

### OUTPUT FORMAT RULES (CRITICAL):
1. Output ONLY a valid, parseable JSON object.
2. Do NOT wrap the JSON in markdown code blocks. Output raw JSON only.
3. The JSON must have exactly these keys:
   - "title": A concise, safe filename.
   - "content": Detailed Markdown body. Synthesize the "selectedText" with "backgroundReferences".
   - "anchorLabel": A short (2-5 words) summary phrase for the link.

### STRICT REQUIREMENTS:
- **Language**: Match the language of the \`selectedText\`.
- **Purity**: Start with \`{\` and end with \`}\`. No introductory text.`,
    inPlaceMetaPrompt: `**Persona:** You are a "Seamless Splicer," an expert Ghostwriter.
**Goal:** Generate text that replaces the \`SELECTION\` based on the \`INSTRUCTION\`, bridging the \`BEFORE\` and \`AFTER\` context perfectly.

### INPUT DATA:
1. **INSTRUCTION**: The rule to apply.
2. **BEFORE & AFTER**: Contextual anchors for tone/style.
3. **SELECTION**: The text to modify.
4. **BACKGROUND REFERENCES**: Optional facts to incorporate.

### EXECUTION RULES:
1. **Context Awareness**: Match the tense, tone, and format of the surrounding text.
2. **Use References**: If background references are present, use them for accuracy.
3. **No Filler**: Return ONLY the result text. No "Here is the text".

### OUTPUT:
Return ONLY the raw text to be inserted.`
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
    backgroundContext: string; // Content of manually selected reference files
    outputAction: OutputAction;
}

export interface GenerationResponse {
    title: string;
    content: string;
    anchorLabel?: string; // Optional field for smarter linking
    isFallback: boolean;
}
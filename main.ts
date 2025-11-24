import { Plugin, Editor, MarkdownView, Notice, TFile, normalizePath, App } from 'obsidian';
import { GeminiNoteSettings, DEFAULT_SETTINGS, GenerationRequest, OutputAction } from './types';
import { GeminiNoteSettingTab } from './settings';
import { GenerationConfigModal } from './modal';
import { GeminiService } from './geminiService';

export default class GeminiNotePlugin extends Plugin {
    settings: GeminiNoteSettings;
    app: App;

    async onload() {
        await this.loadSettings();

        (this as any).addSettingTab(new GeminiNoteSettingTab(this.app, this));

        (this as any).addCommand({
            id: 'gemini-note',
            name: 'Generate Note from Selection',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.handleGenerateCommand(editor, view);
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await (this as any).loadData());
    }

    async saveSettings() {
        await (this as any).saveData(this.settings);
    }

    private handleGenerateCommand(editor: Editor, view: MarkdownView) {
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new Notice("Please select some text first.");
            return;
        }

        const parentFile = view.file;
        if (!parentFile) return;

        (new GenerationConfigModal(this.app, this.settings, async (result) => {
            // Read instruction file content
            const instructionFile = this.app.vault.getAbstractFileByPath(result.instructionPath);
            let instructionContent = "";
            if (instructionFile instanceof TFile) {
                instructionContent = await this.app.vault.read(instructionFile);
            }

            // Capture context
            const parentNoteContent = await this.app.vault.read(parentFile);
            const parentNoteTitle = parentFile.name;
            
            const request: GenerationRequest = {
                instructionPath: result.instructionPath,
                instructionContent,
                contextType: result.contextType,
                saveLocation: result.saveLocation,
                selectedText,
                parentNoteContent,
                parentNoteTitle
            };

            this.runGeneration(request, parentFile, editor, result.outputAction);

        }) as any).open();
    }

    private async runGeneration(request: GenerationRequest, parentFile: TFile, editor: Editor, outputAction: OutputAction) {
        // Pre-flight check
        if (!this.settings.apiKey) {
            new Notice("Gemini API key is not set. Please configure it in the plugin settings.");
            return;
        }

        const notice = new Notice("Generating response with Gemini...", 0); // 0 duration = indefinite

        try {
            // Initialize service with settings including the meta prompt and API host
            const service = new GeminiService(
                this.settings.apiKey, 
                this.settings.apiHost,
                this.settings.modelName, 
                this.settings.metaPrompt
            );
            const response = await service.generateNote(request);
            
            notice.hide();

            // Handle Output Actions
            if (outputAction === 'create_note') {
                await this.handleCreateNoteAction(response, request, parentFile, editor);
            } else if (outputAction === 'replace_selection') {
                editor.replaceSelection(response.content);
                new Notice("Replaced text with AI generation.");
            } else if (outputAction === 'insert_after') {
                // To insert after, we replace the selection with "Original + Generated"
                // This ensures it is atomic for Undo
                const newText = request.selectedText + "\n\n" + response.content;
                editor.replaceSelection(newText);
                new Notice("Inserted AI generation after selection.");
            }

        } catch (error) {
            notice.hide();
            console.error(error);
            new Notice("Failed to get a response from Gemini. Check the developer console for details.");
        }
    }

    private async handleCreateNoteAction(response: any, request: GenerationRequest, parentFile: TFile, editor: Editor) {
         // Determine Save Path
         let targetFolder = parentFile.parent?.path || "";
         if (request.saveLocation) {
             targetFolder = normalizePath(request.saveLocation);
             // Ensure folder exists
             if (!this.app.vault.getAbstractFileByPath(targetFolder)) {
                 await this.app.vault.createFolder(targetFolder);
             }
         }

         // Sanitize filename
         const safeTitle = response.title.replace(/[\\/:*?"<>|]/g, '').trim();
         const targetPath = normalizePath(`${targetFolder}/${safeTitle}.md`);

         // Check existence
         if (this.app.vault.getAbstractFileByPath(targetPath)) {
             new Notice(`Note '${targetPath}' already exists. Aborting to prevent data loss.`);
             return;
         }

         // Create Content
         const parentLink = `Generated from: [[${parentFile.path}|${parentFile.basename}]]\n\n---\n\n`;
         const fullContent = parentLink + response.content;

         // Create File
         const newFile = await this.app.vault.create(targetPath, fullContent);

         // Update Parent (Replace selection with link)
         const linkText = `[[${newFile.path}|${request.selectedText}]]`;
         
         // Try to replace in editor if it's still the active view for immediate feedback
         if (this.app.workspace.activeEditor?.editor === editor) {
              editor.replaceSelection(linkText);
         } else {
              // Fallback: Read file and replace text
              const currentParentText = await this.app.vault.read(parentFile);
              const newParentText = currentParentText.replace(request.selectedText, linkText);
              await this.app.vault.modify(parentFile, newParentText);
         }

         if (response.isFallback) {
             new Notice("AI response was unstructured. Created note with a default title.");
         } else {
             new Notice(`Successfully created note: ${safeTitle}`);
         }
    }
}
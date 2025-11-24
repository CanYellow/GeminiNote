
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
            
            // Context Awareness: Get text before and after selection for fluency
            const cursorFrom = editor.getCursor('from');
            const cursorTo = editor.getCursor('to');
            const lastLine = editor.lineCount();
            
            // Grab up to 1000 chars before
            const contextBefore = editor.getRange(
                { line: Math.max(0, cursorFrom.line - 20), ch: 0 }, 
                cursorFrom
            ).slice(-1000);

            // Grab up to 1000 chars after
            const contextAfter = editor.getRange(
                cursorTo,
                { line: Math.min(lastLine, cursorTo.line + 20), ch: 0 }
            ).slice(0, 1000);

            const request: GenerationRequest = {
                instructionPath: result.instructionPath,
                instructionContent,
                contextType: result.contextType,
                saveLocation: result.saveLocation,
                selectedText,
                contextBefore,
                contextAfter,
                parentNoteContent,
                parentNoteTitle,
                outputAction: result.outputAction
            };

            this.runGeneration(request, parentFile, editor);

        }) as any).open();
    }

    private async runGeneration(request: GenerationRequest, parentFile: TFile, editor: Editor) {
        if (!this.settings.apiKey) {
            new Notice("Gemini API key is not set. Please configure it in the plugin settings.");
            return;
        }

        // SAFETY SNAPSHOT: Record the state before async operation
        const snapshotText = request.selectedText;
        
        const notice = new Notice("Generating response with Gemini...", 0);

        try {
            const service = new GeminiService(
                this.settings.apiKey, 
                this.settings.apiHost,
                this.settings.modelName, 
                this.settings.createNoteMetaPrompt,
                this.settings.inPlaceMetaPrompt
            );
            const response = await service.generateNote(request);
            
            notice.hide();

            // VERIFICATION LOGIC: Ensure we are writing to the correct place
            const currentSelection = editor.getSelection();
            let safeToReplace = false;
            let needsRelocation = false;

            if (currentSelection === snapshotText) {
                safeToReplace = true;
            } else {
                // User moved cursor. Let's scan the doc.
                const docContent = editor.getValue();
                const firstIndex = docContent.indexOf(snapshotText);
                const lastIndex = docContent.lastIndexOf(snapshotText);

                if (firstIndex !== -1 && firstIndex === lastIndex) {
                    // Unique match found. Safe to move cursor there.
                    safeToReplace = true;
                    needsRelocation = true;
                    
                    // Calculate position from index (expensive but necessary for safety)
                    const prefix = docContent.substring(0, firstIndex);
                    const lines = prefix.split('\n');
                    const line = lines.length - 1;
                    const ch = lines[lines.length - 1].length;
                    
                    const endPrefix = docContent.substring(0, firstIndex + snapshotText.length);
                    const endLines = endPrefix.split('\n');
                    const endLine = endLines.length - 1;
                    const endCh = endLines[endLines.length - 1].length;

                    editor.setSelection({ line, ch }, { line: endLine, ch: endCh });
                }
            }

            if (!safeToReplace) {
                // FAIL SAFE: Copy to Clipboard
                new Notice("⚠️ Original selection changed or moved. Copied result to clipboard to prevent data loss.");
                let clipboardText = "";
                if (request.outputAction === 'create_note') {
                    // Copy the Link
                    clipboardText = response.anchorLabel 
                        ? `[[${response.title}|${response.anchorLabel}]]` 
                        : `[[${response.title}|${snapshotText}]]`;
                    // We still create the note file though!
                    await this.createNoteFile(response, request, parentFile);
                } else {
                    clipboardText = response.content;
                }
                navigator.clipboard.writeText(clipboardText);
                return;
            }

            // Execute Action (Safe Path)
            if (request.outputAction === 'create_note') {
                await this.handleCreateNoteAction(response, request, parentFile, editor);
            } else if (request.outputAction === 'replace_selection') {
                editor.replaceSelection(response.content);
                new Notice("Replaced text with AI generation.");
            } else if (request.outputAction === 'insert_after') {
                const newText = snapshotText + "\n\n" + response.content;
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
         const newFile = await this.createNoteFile(response, request, parentFile);
         if (!newFile) return; // File creation failed or existed

         // Determine Link Text: Use AI Anchor Label if available, else original selection
         const linkLabel = response.anchorLabel && response.anchorLabel.trim() !== "" 
            ? response.anchorLabel 
            : request.selectedText;

         const linkText = `[[${newFile.path}|${linkLabel}]]`;
         
         // We already verified safety in runGeneration, so we can replace
         editor.replaceSelection(linkText);

         if (response.isFallback) {
             new Notice("AI response was unstructured. Created note with a default title.");
         } else {
             new Notice(`Successfully created note: ${newFile.basename}`);
         }
    }

    private async createNoteFile(response: any, request: GenerationRequest, parentFile: TFile): Promise<TFile | null> {
        let targetFolder = parentFile.parent?.path || "";
        if (request.saveLocation) {
            targetFolder = normalizePath(request.saveLocation);
            if (!this.app.vault.getAbstractFileByPath(targetFolder)) {
                await this.app.vault.createFolder(targetFolder);
            }
        }

        const safeTitle = response.title.replace(/[\\/:*?"<>|]/g, '').trim();
        const targetPath = normalizePath(`${targetFolder}/${safeTitle}.md`);

        if (this.app.vault.getAbstractFileByPath(targetPath)) {
            new Notice(`Note '${targetPath}' already exists. Aborting to prevent data loss.`);
            return null;
        }

        const parentLink = `Generated from: [[${parentFile.path}|${parentFile.basename}]]\n\n---\n\n`;
        const fullContent = parentLink + response.content;

        return await this.app.vault.create(targetPath, fullContent);
    }
}

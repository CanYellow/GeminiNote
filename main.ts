
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

            // Read Background Files Content
            let backgroundContext = "";
            if (result.backgroundFiles && result.backgroundFiles.length > 0) {
                for (const file of result.backgroundFiles) {
                    try {
                        const content = await this.app.vault.read(file);
                        backgroundContext += `\n--- REFERENCE FILE: ${file.path} ---\n${content}\n`;
                    } catch (e) {
                        console.warn(`Failed to read background file: ${file.path}`, e);
                    }
                }
            }

            // Capture context
            const parentNoteContent = await this.app.vault.read(parentFile);
            const parentNoteTitle = parentFile.name;
            
            // Context Awareness
            const cursorFrom = editor.getCursor('from');
            const cursorTo = editor.getCursor('to');
            const lastLine = editor.lineCount();
            
            const contextBefore = editor.getRange(
                { line: Math.max(0, cursorFrom.line - 20), ch: 0 }, 
                cursorFrom
            ).slice(-1000);

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
                backgroundContext,
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

            const currentSelection = editor.getSelection();
            let safeToReplace = false;

            if (currentSelection === snapshotText) {
                safeToReplace = true;
            } else {
                const docContent = editor.getValue();
                const firstIndex = docContent.indexOf(snapshotText);
                const lastIndex = docContent.lastIndexOf(snapshotText);

                if (firstIndex !== -1 && firstIndex === lastIndex) {
                    safeToReplace = true;
                    // Logic to reset cursor selection could be added here if needed, 
                    // but for now, we rely on clipboard fallback if exact cursor match is lost to be safe.
                    // To make it truly auto-relocate is complex without range mapping. 
                    // We will stick to the safer "Clipboard if moved" approach unless the user requests complex range math.
                    
                    // Simple relocation attempt:
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
                new Notice("⚠️ Selection changed. Result copied to clipboard.");
                let clipboardText = "";
                if (request.outputAction === 'create_note') {
                    clipboardText = response.anchorLabel 
                        ? `[[${response.title}|${response.anchorLabel}]]` 
                        : `[[${response.title}|${snapshotText}]]`;
                    await this.createNoteFile(response, request, parentFile);
                } else {
                    clipboardText = response.content;
                }
                navigator.clipboard.writeText(clipboardText);
                return;
            }

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
            new Notice("Failed to get a response from Gemini. Check console.");
        }
    }

    private async handleCreateNoteAction(response: any, request: GenerationRequest, parentFile: TFile, editor: Editor) {
         const newFile = await this.createNoteFile(response, request, parentFile);
         if (!newFile) return;

         const linkLabel = response.anchorLabel && response.anchorLabel.trim() !== "" 
            ? response.anchorLabel 
            : request.selectedText;

         const linkText = `[[${newFile.path}|${linkLabel}]]`;
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
            new Notice(`Note '${targetPath}' already exists. Aborting.`);
            return null;
        }

        const parentLink = `Generated from: [[${parentFile.path}|${parentFile.basename}]]\n\n---\n\n`;
        const fullContent = parentLink + response.content;

        return await this.app.vault.create(targetPath, fullContent);
    }
}

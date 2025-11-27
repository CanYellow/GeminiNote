import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { GeminiNoteSettings, OutputAction } from "./types";

export class GenerationConfigModal extends Modal {
    private settings: GeminiNoteSettings;
    private onSubmit: (result: { 
        instructionPath: string; 
        contextType: 'selection_only' | 'selection_and_full_note'; 
        saveLocation: string; 
        outputAction: OutputAction;
        backgroundFiles: TFile[];
    }) => void;
    
    private selectedInstructionPath: string = "";
    private selectedContext: 'selection_only' | 'selection_and_full_note';
    private saveLocation: string;
    private selectedOutputAction: OutputAction;
    
    // Background File Selection State
    private selectedBackgroundFiles: TFile[] = [];
    private allMarkdownFiles: TFile[] = [];

    // Explicitly declare properties
    contentEl: HTMLElement;
    app: App;

    constructor(
        app: App, 
        settings: GeminiNoteSettings, 
        onSubmit: (result: { 
            instructionPath: string; 
            contextType: 'selection_only' | 'selection_and_full_note'; 
            saveLocation: string; 
            outputAction: OutputAction;
            backgroundFiles: TFile[];
        }) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        this.selectedContext = settings.defaultContext;
        this.saveLocation = settings.defaultSaveLocation;
        this.selectedOutputAction = settings.defaultOutputAction;
        this.selectedInstructionPath = "";
        
        // We will fetch files in onOpen to ensure freshness
        this.allMarkdownFiles = [];
    }

    async onOpen() {
        // Refresh the file list every time the modal opens
        this.allMarkdownFiles = this.app.vault.getMarkdownFiles();

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("gemini-gen-modal");

        contentEl.createEl("h2", { text: "Generate Note with Gemini" });

        // --- 1. Instruction Selection ---
        const instructions = this.getInstructionFiles();
        if (instructions.length === 0) {
            new Setting(contentEl)
                .setName("Task Instruction")
                .setDesc("No instructions found in the configured folder.")
                .setDisabled(true);
        } else {
            if (!this.selectedInstructionPath && instructions.length > 0) {
                this.selectedInstructionPath = instructions[0].path;
            }
            new Setting(contentEl)
                .setName("Task Instruction")
                .setDesc("Select a template for generation")
                .addDropdown(dropdown => {
                    instructions.forEach(file => {
                        dropdown.addOption(file.path, file.basename);
                    });
                    dropdown.setValue(this.selectedInstructionPath);
                    dropdown.onChange(async (value) => {
                        this.selectedInstructionPath = value;
                    });
                });
        }

        // --- 2. Context Scope ---
        new Setting(contentEl)
            .setName("Target Context")
            .setDesc("Scope of the active note to send")
            .addDropdown(dropdown => {
                dropdown.addOption("selection_only", "Selection Only");
                dropdown.addOption("selection_and_full_note", "Selection + Full Parent Note");
                dropdown.setValue(this.selectedContext);
                dropdown.onChange((value) => {
                    this.selectedContext = value as any;
                });
            });

        // --- 3. Background Reference Files (Multi-Select) ---
        const refContainer = contentEl.createDiv('reference-files-container');
        refContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        refContainer.style.marginTop = '15px';
        refContainer.style.paddingTop = '10px';
        refContainer.createEl('h4', { text: 'Background Reference Files (Optional)' });
        refContainer.createEl('small', { text: 'Search and add files to provide extra context.' }).style.display = 'block';

        // Container for Selected Files List
        const selectedListEl = refContainer.createDiv('selected-files-list');
        selectedListEl.style.marginBottom = '10px';
        selectedListEl.style.display = 'flex';
        selectedListEl.style.flexWrap = 'wrap';
        selectedListEl.style.gap = '5px';

        const renderSelectedFiles = () => {
            selectedListEl.empty();
            this.selectedBackgroundFiles.forEach((file, index) => {
                const tag = selectedListEl.createDiv('nav-file-tag');
                tag.style.display = 'flex';
                tag.style.alignItems = 'center';
                tag.style.backgroundColor = 'var(--background-secondary)';
                tag.style.padding = '2px 8px';
                tag.style.borderRadius = '4px';
                tag.style.fontSize = '0.9em';
                
                tag.createSpan({ text: file.basename });
                const removeBtn = tag.createSpan({ text: ' ×' });
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.marginLeft = '5px';
                removeBtn.style.color = 'var(--text-muted)';
                removeBtn.onclick = () => {
                    this.selectedBackgroundFiles.splice(index, 1);
                    renderSelectedFiles();
                };
            });
        };

        // Search Input
        const searchContainer = refContainer.createDiv('search-input-container');
        const resultsContainer = refContainer.createDiv('search-results');
        resultsContainer.style.maxHeight = '150px';
        resultsContainer.style.overflowY = 'auto';
        resultsContainer.style.border = '1px solid var(--background-modifier-border)';
        resultsContainer.style.display = 'none'; // Hidden by default

        const searchInput = searchContainer.createEl('input', { type: 'text', placeholder: 'Search vault files (path or name)...' });
        searchInput.style.width = '100%';
        
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            resultsContainer.empty();
            
            if (query.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }

            // Fix: Search by 'path' instead of just 'basename' to find files in folders
            const matches = this.allMarkdownFiles
                .filter(f => f.path.toLowerCase().includes(query) && !this.selectedBackgroundFiles.includes(f))
                .slice(0, 10); // Limit results

            if (matches.length > 0) {
                resultsContainer.style.display = 'block';
                matches.forEach(file => {
                    const resultItem = resultsContainer.createDiv('suggestion-item');
                    resultItem.style.padding = '5px 10px';
                    resultItem.style.cursor = 'pointer';
                    // Show full path for clarity
                    resultItem.innerText = file.path;
                    
                    resultItem.onmouseenter = () => resultItem.style.backgroundColor = 'var(--background-secondary)';
                    resultItem.onmouseleave = () => resultItem.style.backgroundColor = 'transparent';

                    resultItem.onclick = () => {
                        this.selectedBackgroundFiles.push(file);
                        renderSelectedFiles();
                        searchInput.value = '';
                        resultsContainer.style.display = 'none';
                    };
                });
            } else {
                resultsContainer.style.display = 'none';
            }
        });

        renderSelectedFiles();

        // --- 4. Output Action ---
        new Setting(contentEl)
            .setName("Output Action")
            .setDesc("How to handle the generated result")
            .addDropdown(dropdown => {
                dropdown.addOption("create_note", "Create New Note");
                dropdown.addOption("replace_selection", "Replace Selected Text");
                dropdown.addOption("insert_after", "Insert at Selection");
                dropdown.setValue(this.selectedOutputAction);
                dropdown.onChange((value) => {
                    this.selectedOutputAction = value as OutputAction;
                    this.updateSaveLocationVisibility(saveLocationSettingEl);
                });
            });

        // --- 5. Save Location ---
        const saveLocationSetting = new Setting(contentEl)
            .setName("Save Location (Subfolder)")
            .setDesc("Leave empty to save in the same folder as parent")
            .addText(text => {
                text.setValue(this.saveLocation);
                text.onChange(value => {
                    this.saveLocation = value;
                });
            });
        
        const saveLocationSettingEl = saveLocationSetting.settingEl;
        this.updateSaveLocationVisibility(saveLocationSettingEl);

        // --- Actions ---
        new Setting(contentEl)
            .addButton(btn => 
                btn
                    .setButtonText("Generate")
                    .setCta()
                    .onClick(() => {
                        this.submitForm();
                    })
            );

        // Enter key support
        contentEl.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                this.submitForm();
            }
        });
    }

    private updateSaveLocationVisibility(element: HTMLElement) {
        if (this.selectedOutputAction === 'create_note') {
            element.style.display = 'flex';
        } else {
            element.style.display = 'none';
        }
    }

    private submitForm() {
        if (!this.selectedInstructionPath) {
            new Notice("Please select a task instruction.");
            return;
        }
        (this as any).close();
        this.onSubmit({
            instructionPath: this.selectedInstructionPath,
            contextType: this.selectedContext,
            saveLocation: this.saveLocation,
            outputAction: this.selectedOutputAction,
            backgroundFiles: this.selectedBackgroundFiles
        });
    }

    private getInstructionFiles(): TFile[] {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.instructionsFolder);
        if (!folder) return [];
        // @ts-ignore
        if (folder.children) {
             // @ts-ignore
            return folder.children.filter(f => f instanceof TFile && f.extension === 'md');
        }
        return [];
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
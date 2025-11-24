import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { GeminiNoteSettings, OutputAction } from "./types";

export class GenerationConfigModal extends Modal {
    private settings: GeminiNoteSettings;
    private onSubmit: (result: { instructionPath: string; contextType: 'selection_only' | 'selection_and_full_note'; saveLocation: string; outputAction: OutputAction }) => void;
    
    private selectedInstructionPath: string = "";
    private selectedContext: 'selection_only' | 'selection_and_full_note';
    private saveLocation: string;
    private selectedOutputAction: OutputAction;

    // Explicitly declare properties that are missing from the base type definition
    contentEl: HTMLElement;
    app: App;

    constructor(
        app: App, 
        settings: GeminiNoteSettings, 
        onSubmit: (result: { instructionPath: string; contextType: 'selection_only' | 'selection_and_full_note'; saveLocation: string; outputAction: OutputAction }) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        this.selectedContext = settings.defaultContext;
        this.saveLocation = settings.defaultSaveLocation;
        this.selectedOutputAction = settings.defaultOutputAction;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Generate Note with Gemini" });

        // Instruction Selection
        const instructions = this.getInstructionFiles();
        
        if (instructions.length === 0) {
            new Setting(contentEl)
                .setName("Task Instruction")
                .setDesc("No instructions found in the configured folder.")
                .setDisabled(true);
        } else {
            this.selectedInstructionPath = instructions[0].path; // Default to first
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

        // Context Selection
        new Setting(contentEl)
            .setName("Context")
            .setDesc("What data to send to the AI")
            .addDropdown(dropdown => {
                dropdown.addOption("selection_only", "Selection Only");
                dropdown.addOption("selection_and_full_note", "Selection + Full Parent Note");
                dropdown.setValue(this.selectedContext);
                dropdown.onChange((value) => {
                    this.selectedContext = value as any;
                });
            });

        // Output Action Selection
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

        // Save Location (Dynamically hidden)
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

        // Actions
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
            outputAction: this.selectedOutputAction
        });
    }

    private getInstructionFiles(): TFile[] {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.instructionsFolder);
        if (!folder) return [];
        
        // Helper to recursively get markdown files
        // @ts-ignore - TS doesn't strictly know it's a TFolder with children
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
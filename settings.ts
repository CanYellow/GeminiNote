
import { App, PluginSettingTab, Setting } from "obsidian";
import GeminiNotePlugin from "./main";

export class GeminiNoteSettingTab extends PluginSettingTab {
    plugin: GeminiNotePlugin;
    containerEl: HTMLElement;

    constructor(app: App, plugin: GeminiNotePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Gemini Note Generator Settings' });

        // Helper to create a block-style setting (Description Top, Input Bottom)
        const addBlockSetting = (name: string, desc: string) => {
            const settingEl = containerEl.createDiv('setting-item');
            settingEl.style.display = 'block'; // Force vertical stacking
            settingEl.style.borderTop = '1px solid var(--background-modifier-border)';
            settingEl.style.padding = '18px 0';

            const infoEl = settingEl.createDiv('setting-item-info');
            infoEl.style.margin = '0 0 10px 0'; // Space between desc and input
            infoEl.style.width = '100%';

            const nameEl = infoEl.createDiv('setting-item-name');
            nameEl.innerText = name;
            
            const descEl = infoEl.createDiv('setting-item-description');
            descEl.innerText = desc;
            descEl.style.color = 'var(--text-muted)';
            
            const controlEl = settingEl.createDiv('setting-item-control');
            controlEl.style.width = '100%';
            
            return controlEl;
        };

        // --- API CONFIGURATION ---

        const apiKeyControl = addBlockSetting('Gemini API Key', 'Your Google Gemini API Key');
        const apiKeyInput = apiKeyControl.createEl('input', { type: 'text' });
        apiKeyInput.type = 'password';
        apiKeyInput.style.width = '100%';
        apiKeyInput.value = this.plugin.settings.apiKey;
        apiKeyInput.placeholder = 'Enter your API key';
        apiKeyInput.addEventListener('change', async () => {
             this.plugin.settings.apiKey = apiKeyInput.value;
             await this.plugin.saveSettings();
        });

        const apiHostControl = addBlockSetting('API Host (Optional)', 'Base URL for the API. Useful for proxies (e.g., https://gemini-proxy.briht.space). If set, this overrides the default Google API connection.');
        const apiHostInput = apiHostControl.createEl('input', { type: 'text' });
        apiHostInput.style.width = '100%';
        apiHostInput.value = this.plugin.settings.apiHost;
        apiHostInput.placeholder = 'https://generativelanguage.googleapis.com';
        apiHostInput.addEventListener('change', async () => {
             this.plugin.settings.apiHost = apiHostInput.value;
             await this.plugin.saveSettings();
        });

        // --- STANDARD SETTINGS (Standard Row Layout) ---
        
        containerEl.createEl('h3', { text: 'General Configuration' });

        new Setting(containerEl)
            .setName('Model Name')
            .setDesc('The Gemini model to use (e.g., gemini-1.5-pro-latest)')
            .addText(text => text
                .setPlaceholder('gemini-1.5-pro-latest')
                .setValue(this.plugin.settings.modelName)
                .onChange(async (value) => {
                    this.plugin.settings.modelName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Task Instructions Folder')
            .setDesc('Path to folder containing instruction templates')
            .addText(text => text
                .setPlaceholder('Templates/Instructions')
                .setValue(this.plugin.settings.instructionsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.instructionsFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Context')
            .setDesc('Default context selection in the modal')
            .addDropdown(dropdown => dropdown
                .addOption('selection_only', 'Selection Only')
                .addOption('selection_and_full_note', 'Selection + Full Parent Note')
                .setValue(this.plugin.settings.defaultContext)
                .onChange(async (value) => {
                    this.plugin.settings.defaultContext = value as any;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Default Output Action')
            .setDesc('Default action to take with the generated content')
            .addDropdown(dropdown => dropdown
                .addOption('create_note', 'Create New Note')
                .addOption('replace_selection', 'Replace Selected Text')
                .addOption('insert_after', 'Insert at Selection')
                .setValue(this.plugin.settings.defaultOutputAction)
                .onChange(async (value) => {
                    this.plugin.settings.defaultOutputAction = value as any;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Save Location')
            .setDesc('Default subfolder for generated notes (only applied when creating a new note)')
            .addText(text => text
                .setValue(this.plugin.settings.defaultSaveLocation)
                .onChange(async (value) => {
                    this.plugin.settings.defaultSaveLocation = value;
                    await this.plugin.saveSettings();
                }));

        // --- PROMPT CONFIGURATION ---
        containerEl.createEl('h3', { text: 'Meta Prompts (System Instructions)' });

        const createNotePromptControl = addBlockSetting('Create Note Meta Prompt', 'Instructions used when "Create New Note" is selected. MUST strictly enforce JSON output with "title", "content", and "anchorLabel".');
        const createNotePromptInput = createNotePromptControl.createEl('textarea');
        createNotePromptInput.style.width = '100%';
        createNotePromptInput.style.height = '120px';
        createNotePromptInput.style.fontFamily = 'monospace';
        createNotePromptInput.value = this.plugin.settings.createNoteMetaPrompt;
        createNotePromptInput.addEventListener('change', async () => {
             this.plugin.settings.createNoteMetaPrompt = createNotePromptInput.value;
             await this.plugin.saveSettings();
        });

        const inPlacePromptControl = addBlockSetting('In-Place Edit Meta Prompt', 'Instructions used when Replacing or Inserting text. Should encourage natural flow and context awareness. Expects raw text output.');
        const inPlacePromptInput = inPlacePromptControl.createEl('textarea');
        inPlacePromptInput.style.width = '100%';
        inPlacePromptInput.style.height = '120px';
        inPlacePromptInput.style.fontFamily = 'monospace';
        inPlacePromptInput.value = this.plugin.settings.inPlaceMetaPrompt;
        inPlacePromptInput.addEventListener('change', async () => {
             this.plugin.settings.inPlaceMetaPrompt = inPlacePromptInput.value;
             await this.plugin.saveSettings();
        });
    }
}

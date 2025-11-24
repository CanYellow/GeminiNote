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

        const promptControl = addBlockSetting('Meta Prompt', 'The system instruction sent to the AI. Explicitly define the JSON structure here.');
        const promptInput = promptControl.createEl('textarea');
        promptInput.style.width = '100%';
        promptInput.style.height = '150px';
        promptInput.style.fontFamily = 'monospace';
        promptInput.value = this.plugin.settings.metaPrompt;
        promptInput.addEventListener('change', async () => {
             this.plugin.settings.metaPrompt = promptInput.value;
             await this.plugin.saveSettings();
        });
    }
}
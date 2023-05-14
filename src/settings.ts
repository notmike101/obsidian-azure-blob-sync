import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
import type AzureBlobSync from './main';

export class SettingsTab extends PluginSettingTab {
	#plugin: AzureBlobSync;
  #saveButton: ButtonComponent | undefined;

	constructor(app: App, plugin: AzureBlobSync) {
		super(app, plugin);

		this.#plugin = plugin;
	}

  #enableSaveButton() {
    this.#saveButton?.setCta();
    this.#saveButton?.setDisabled(false);
  }

  #disableSaveButton() {
    this.#saveButton?.removeCta();
    this.#saveButton?.setDisabled(true);
  }

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', {text: 'Settings for Azure Blob Sync'});

    new Setting(containerEl)
      .setName('Account Name')
      .setDesc('This is the name of your Azure Blob Storage account.')
      .addText((text) => {
        return text
          .setPlaceholder('<AccountName>')
          .setValue(this.#plugin.settings.accountName)
          .onChange(async (value) => {
            this.#plugin.settings.accountName = value;

            this.#enableSaveButton();
          });
      });

		new Setting(containerEl)
			.setName('Shared Access Signature Token')
			.setDesc('This is the shared access signature token for your Azure Blob Storage container.')
			.addText((text) => {
        return text
          .setPlaceholder('<AccountKey>')
          .setValue(this.#plugin.settings.sasToken)
          .onChange(async (value) => {
            if (!value.startsWith('?')) {
              value = `?${value}`;
            }

            this.#plugin.settings.sasToken = value;

            this.#enableSaveButton();
          });
      });

    new Setting(containerEl)
      .setName('Container Name')
      .setDesc('This is the name of the container in your Azure Blob Storage account where your Obsidian vault will be synced. Leave empty for root.')
      .addText((text) => {
        return text
          .setPlaceholder('<ContainerName>')
          .setValue(this.#plugin.settings.containerName)
          .onChange(async (value) => {
            this.#plugin.settings.containerName = value;

            this.#enableSaveButton();
          });
      });

    new Setting(containerEl)
      .setName('Base Directory')
      .setDesc('This is the base directory in your Azure Blob Storage account where your Obsidian vault will be synced.')
      .addText((text) => {
        return text
          .setPlaceholder('<BaseDirectory>')
          .setValue(this.#plugin.settings.baseDirectory)
          .onChange(async (value) => {
            value = value.replace(/\/+/g, '/');

            if (value === '/') {
              value = '';
            } else {
              if (value.startsWith('/')) {
                value = value.substring(1);
              }

              if (value.length > 0 && !value.endsWith('/')) {
                value = `${value}/`;
              }
            }

            this.#plugin.settings.baseDirectory = value;

            this.#enableSaveButton();
          });
      });

    new Setting(containerEl)
      .setName('Debug')
      .setDesc('This will enable debug logging for the plugin.')
      .addToggle((toggle) => {
        return toggle
          .setValue(this.#plugin.settings.debug)
          .onChange(async (value) => {
            this.#plugin.settings.debug = value;

            this.#enableSaveButton();
          });
      });

    const saveButton = new Setting(containerEl)
      .addButton((button) => {
        return button
          .setButtonText('Save')
          .setDisabled(true)
          .onClick(async () => {
            await this.#plugin.saveSettings();
            this.#disableSaveButton();
          });
      });

    this.#saveButton = saveButton.components[0] as ButtonComponent;
	}
}

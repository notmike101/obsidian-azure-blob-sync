import { Plugin, TAbstractFile, TFile } from 'obsidian';
import { SettingsTab } from './settings';
import { SyncService } from './sync-service';
import { isFile } from './utils';

interface ISettings {
	accountName: string;
  sasToken: string;
  containerName: string;
  baseDirectory: string;
	periodicSyncInterval: number;
	debug: boolean;
}

const DEFAULT_SETTINGS: ISettings = {
	accountName: '',
	sasToken: '',
	containerName: '',
	baseDirectory: '',
	periodicSyncInterval: 5,
	debug: false,
}

export default class AzureBlobSync extends Plugin {
	settings: ISettings;
	#syncService: SyncService;
	#syncInterval: number | undefined;

	async #setupSyncService() {
		const { accountName, sasToken, containerName, baseDirectory, debug } = this.settings;
		const { vault } = this.app;

		if (this.#syncInterval) {
			window.clearInterval(this.#syncInterval);
		}

		this.#syncService = new SyncService({
			accountName,
			sasToken,
			containerName,
			baseDirectory,
			vault,
			debug,
		});

		await this.#syncService.initialize();
		await this.#syncService.uploadAllFilesInVault();
		await this.#syncService.downloadAllFilesInContainer();

		this.#syncInterval = window.setInterval(this.#manualSync, this.settings.periodicSyncInterval * 1000 * 60);

		this.registerInterval(this.#syncInterval);
	}

	async onload() {
		await this.loadSettings();
		await this.#setupSyncService();

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerEvent(this.app.vault.on('delete', this.#vaultDeleteEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('rename', this.#vaultRenameEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('modify', this.#vaultModifyEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('create', this.#vaultCreateEventHandler.bind(this)));
		this.addRibbonIcon('refresh-cw', 'Force Sync With Azure Blob Storage', this.#manualSync.bind(this));

		this.addCommand({
			id: 'sync',
			name: 'Force Sync With Azure Blob Storage',
			callback: this.#manualSync.bind(this),
		});

		this.addCommand({
			id: 'upload',
			name: 'Upload All Files To Azure Blob Storage',
			callback: this.#syncService.uploadAllFilesInVault.bind(this.#syncService),
		});

		this.addCommand({
			id: 'download',
			name: 'Download All Files From Azure Blob Storage',
			callback: this.#syncService.downloadAllFilesInContainer.bind(this.#syncService),
		});
	}

	async #manualSync() {
		await this.#syncService.uploadAllFilesInVault();
		await this.#syncService.downloadAllFilesInContainer();
	}

	#vaultDeleteEventHandler(fileOrFolder: TAbstractFile) {
		this.#syncService.deleteFile(fileOrFolder.path);
	}

	#vaultRenameEventHandler(fileOrFolder: TAbstractFile, oldPath: string) {
		this.#syncService.renameFile(oldPath, fileOrFolder.path);
	}

	async #vaultModifyEventHandler(fileOrFolder: TAbstractFile) {
		const fileContent = await this.app.vault.cachedRead(fileOrFolder as TFile);

		this.#syncService.uploadFile({
			fileName: fileOrFolder.path,
			fileContent: new Blob([fileContent], { type: 'text/plain' }),
			fileLength: (fileOrFolder as TFile).stat.size
		});
	}

	async #vaultCreateEventHandler(fileOrFolder: TAbstractFile) {
		if (!isFile(fileOrFolder)) return;

		const fileContent = await this.app.vault.cachedRead(fileOrFolder as TFile);

		this.#syncService.uploadFile({
			fileName: fileOrFolder.path,
			fileContent: new Blob([fileContent], { type: 'text/plain' }),
			fileLength: (fileOrFolder as TFile).stat.size
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		const oldSettings = await this.loadData();
		console.log(oldSettings, this.settings);

		await this.saveData(this.settings);
		await this.#setupSyncService();
	}
}

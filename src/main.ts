import { Plugin, TAbstractFile, TFile } from 'obsidian';
import { SettingsTab } from './settings';
import { SyncService } from './sync-service';
import { isFile } from './utils';
import { Logger, LogLevel } from './logger';

interface ISettings {
	accountName: string;
  sasToken: string;
  containerName: string;
  baseDirectory: string;
	periodicSyncInterval: number;
	debug: boolean;
	syncOnStartup: boolean;
	syncOnInterval: boolean;
}

const DEFAULT_SETTINGS: ISettings = {
	accountName: '',
	sasToken: '',
	containerName: '',
	baseDirectory: '',
	periodicSyncInterval: 5,
	debug: false,
	syncOnStartup: true,
	syncOnInterval: true,
};

export default class AzureBlobSync extends Plugin {
	settings: ISettings;
	#syncService: SyncService;
	#syncInterval: number | undefined;
	#logger: Logger;

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

		if (this.settings.syncOnStartup === true) {
			await this.doSync();
		}

		if (this.settings.syncOnInterval === true) {
			this.#syncInterval = window.setInterval(this.doSync.bind(this), this.settings.periodicSyncInterval * 1000 * 60);

			this.registerInterval(this.#syncInterval);
		}
	}

	async onload() {
		await this.loadSettings();

		this.#logger = Logger.create('Azure Blob Sync', this.settings.debug ? LogLevel.DEBUG : LogLevel.INFO);

		await this.#setupSyncService();

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerEvent(this.app.vault.on('delete', this.#vaultDeleteEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('rename', this.#vaultRenameEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('modify', this.#vaultModifyEventHandler.bind(this)));
		this.registerEvent(this.app.vault.on('create', this.#vaultCreateEventHandler.bind(this)));
		this.addRibbonIcon('refresh-cw', 'Sync With Azure Blob Storage', this.doSync.bind(this));

		this.addCommand({
			id: 'sync',
			name: 'Sync With Azure Blob Storage',
			callback: this.doSync.bind(this),
		});

		this.addCommand({
			id: 'upload',
			name: 'Upload All Files To Azure Blob Storage',
			callback: this.#syncService.uploadAllFilesInVault.bind(this),
		});

		this.addCommand({
			id: 'download',
			name: 'Download All Files From Azure Blob Storage',
			callback: this.#syncService.downloadAllFilesInContainer.bind(this),
		});
	}

	async doSync() {
		this.#logger.debug('Started sync');

		await this.#syncService.uploadAllFilesInVault();
		await this.#syncService.downloadAllFilesInContainer();

		this.#logger.debug('Finished sync');
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
		await this.saveData(this.settings);
		await this.#setupSyncService();
	}
}

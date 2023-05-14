import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { isFolder, doesFileOrFolderExist } from './utils';
import { Logger, LogLevel } from './logger';
import type { TFile, Vault } from 'obsidian';

interface ISyncServiceOptions {
  accountName: string;
  sasToken: string;
  containerName: string;
  baseDirectory: string;
  vault: Vault;
  debug: boolean;
}

export class SyncService {
  #service: BlobServiceClient;
  #containerClient: ContainerClient;
  #sasToken: string;
  #containerName: string;
  #accountName: string;
  #baseDirectory: string;
  #vault: Vault;
  debug: boolean;
  #isActive = false;
  #logger: Logger;

  constructor(options: ISyncServiceOptions) {
    this.#baseDirectory = options.baseDirectory;
    this.#accountName = options.accountName;
    this.#sasToken = options.sasToken;
    this.#containerName = options.containerName;
    this.#vault = options.vault;
    this.debug = options.debug;
    this.#logger = Logger.create('Azure Blob Sync', this.debug ? LogLevel.DEBUG : LogLevel.INFO);

    this.#logger.debug('Account Name is', this.#accountName);
    this.#logger.debug('Container Name is', this.#containerName);
    this.#logger.debug('Base Directory is', this.#baseDirectory);
  }

  get isActive() {
    return this.#isActive;
  }

  async initialize() {
    try {
      if (!this.#accountName) throw new Error('Account Name is required');
      if (!this.#sasToken) throw new Error('SAS Token is required');
      if (!this.#containerName) throw new Error('Container Name is required');

      this.#service = new BlobServiceClient(`https://${this.#accountName}.blob.core.windows.net${this.#sasToken}`);
      this.#containerClient = this.#service.getContainerClient(this.#containerName);

      this.#isActive = true;

      this.#logger.info('SyncService initialized')
    } catch(err) {
      this.#logger.error('Error initializing SyncService', err);
    }
  }

  async uploadFile(file: { fileName: string; fileContent: Blob; fileLength: number}) {
    try {
      if (this.#isActive === false) return;

      const { fileName, fileContent, fileLength } = file;

      this.#logger.debug('Uploading file', fileName);

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${fileName}`);

      await blockBlobClient.upload(fileContent, fileLength);

      this.#logger.debug('Done uploading file', fileName);
    } catch (err) {
      this.#logger.error('Error uploading file', err);
    }
  }

  async renameFile(oldFileName: string, newFileName: string) {
    try {
      if (this.#isActive === false) return;

      this.#logger.debug('Renaming file', oldFileName, 'to', newFileName);

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${oldFileName}`);
      const newBlockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${newFileName}`);

      await newBlockBlobClient.beginCopyFromURL(blockBlobClient.url);
      await blockBlobClient.delete();

      this.#logger.debug('Done renaming file', oldFileName, 'to', newFileName);
    } catch (err) {
      this.#logger.error('Error renaming file', err);
    }
  }

  async downloadFile(fileName: string) {
    try {
      if (this.#isActive === false) return;

      this.#logger.debug('Downloading file', fileName);

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${fileName}`);
      const downloadBlockBlobResponse = await blockBlobClient.download();
      const downloadBlockBlobBody = await downloadBlockBlobResponse.blobBody;

      if (!downloadBlockBlobBody) throw new Error('Blob body is null');

      const downloaded = await new Promise<string | ArrayBuffer | null | undefined>((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.addEventListener('loadend', (event: ProgressEvent<FileReader>) => {
          resolve(event.target?.result);
        });

        fileReader.addEventListener('error', reject);

        fileReader.readAsText(downloadBlockBlobBody);
      });

      this.#logger.debug('Done downloading file', fileName);

      return downloaded?.toString();
    } catch (err) {
      this.#logger.error('Error downloading file', err);
    }
  }

  async deleteFile(fileName: string) {
    try {
      if (this.#isActive === false) return;

      this.#logger.debug('Deleting file', fileName);

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${fileName}`);

      await blockBlobClient.delete();

      this.#logger.debug('Done deleting file', fileName);
    } catch (err) {
      this.#logger.error('Error deleting file', err);
    }
  }

  async uploadAllFilesInVault() {
    if (this.#isActive === false) return;

    const vaultFiles = this.#vault.getMarkdownFiles();

    this.#logger.debug('Found', vaultFiles.length, 'files in vault', vaultFiles);

    for await (const file of vaultFiles) {
      const { path: fileName } = file;
      const fileContent = await this.#vault.cachedRead(file);
      const fileLength = fileContent.length;

      this.#logger.debug('Uploading file', fileName);

      await this.uploadFile({
        fileName,
        fileContent: new Blob([fileContent]),
        fileLength,
      });

      this.#logger.debug('Done uploading file', fileName);
    }

    this.#logger.debug('Finished uploading all files in vault');
  }

  async downloadAllFilesInContainer() {
    if (this.#isActive === false) return;

    const blobs = this.#containerClient.listBlobsFlat({ prefix: this.#baseDirectory });
    const vaultFiles = this.#vault.getMarkdownFiles();
    const blobNames = new Set<string>();

    for await (const blob of blobs) {
      blobNames.add(blob.name.replace(this.#baseDirectory, ''));
    }

    this.#logger.debug('Found', blobNames.size, 'files in container', blobNames.keys());

    for (const file of vaultFiles) {
      if (!blobNames.has(file.path)) continue;

      this.#logger.debug('Downloading latest version of', file.path, 'from the container');

      const blobFileContent = await this.downloadFile(file.path);
      await this.#vault.modify(file, blobFileContent ?? '');

      blobNames.delete(file.path);

      this.#logger.debug('Finished downloading latest version of', file.path, 'from the container');
    }

    this.#logger.debug('Remaining untracked files in container', blobNames.keys());

    for (const blobName of blobNames.keys()) {
      // Split the full blobName by the / character and filter out any empty strings
      const pathFolders = blobName.split('/').filter((pathFolder) => pathFolder !== '');

      for (let i = 0; i < pathFolders.length - 1; i++) {
        const pathFolder = pathFolders.slice(0, i + 1).join('/');

        this.#logger.debug('Checking if', pathFolder, 'exists');

        if (doesFileOrFolderExist(this.#vault, pathFolder)) continue;

        this.#logger.debug('Creating folder', pathFolder);

        await this.#vault.createFolder(pathFolder);
      }

      const blobFileContent = await this.downloadFile(blobName);

      if (!blobFileContent) continue;

      if (doesFileOrFolderExist(this.#vault, blobName)) {
        const existingFile = this.#vault.getAbstractFileByPath(blobName);

        if (existingFile && isFolder(existingFile)) {
          this.#logger.debug(blobName, 'is a folder, skipping');

          continue;
        }

        this.#logger.debug('Modifying file', blobName);

        await this.#vault.modify((existingFile as TFile), blobFileContent);
      } else {
        this.#logger.debug('Creating file', blobName);

        await this.#vault.create(blobName, blobFileContent ?? '');
      }
    }

    this.#logger.debug('Finished downloading all files in container');
  }
}

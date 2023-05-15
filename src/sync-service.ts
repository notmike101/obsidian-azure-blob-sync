import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { Logger, LogLevel } from './logger';
import type { Vault } from 'obsidian';

interface ISyncServiceOptions {
  accountName: string;
  sasToken: string;
  containerName: string;
  baseDirectory: string;
  vault: Vault;
  debug: boolean;
}

export class SyncService {
  service: BlobServiceClient;
  containerClient: ContainerClient;
  sasToken: string;
  containerName: string;
  accountName: string;
  baseDirectory: string;
  vault: Vault;
  logger: Logger;
  debug: boolean;
  isActive = false;

  constructor(options: ISyncServiceOptions) {
    this.baseDirectory = options.baseDirectory;
    this.accountName = options.accountName;
    this.sasToken = options.sasToken;
    this.containerName = options.containerName;
    this.vault = options.vault;
    this.debug = options.debug;
    this.logger = Logger.create('Azure Blob Sync', this.debug ? LogLevel.DEBUG : LogLevel.INFO);

    this.logger.debug('[SyncService.constructor] Account Name is', this.accountName);
    this.logger.debug('[SyncService.constructor] Container Name is', this.containerName);
    this.logger.debug('[SyncService.constructor] Base Directory is', this.baseDirectory);
  }

  async initialize() {
    try {
      if (!this.accountName) throw new Error('Account Name is required');
      if (!this.sasToken) throw new Error('SAS Token is required');
      if (!this.containerName) throw new Error('Container Name is required');

      this.service = new BlobServiceClient(`https://${this.accountName}.blob.core.windows.net${this.sasToken}`);
      this.containerClient = this.service.getContainerClient(this.containerName);

      this.isActive = true;

      this.logger.info('[SyncService.initialize] SyncService initialized')
    } catch(err) {
      this.logger.error('[SyncService.initialize] Error initializing SyncService', err);
    }
  }

  async uploadFile(file: { fileName: string; fileContent: Blob; fileLength: number}) {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      const { fileName, fileContent, fileLength } = file;
      const blockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${fileName}`);

      this.logger.debug('[SyncService.uploadFile] Uploading file', fileName);

      await blockBlobClient.upload(fileContent, fileLength);

      this.logger.debug('[SyncService.uploadFile] Done uploading file', fileName);
    } catch (err) {
      this.logger.error('[SyncService.uploadFile] Error uploading file', err);
    }
  }

  async renameFile(oldFileName: string, newFileName: string) {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      this.logger.debug('Renaming file', oldFileName, 'to', newFileName);

      const blockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${oldFileName}`);
      const newBlockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${newFileName}`);

      await newBlockBlobClient.beginCopyFromURL(blockBlobClient.url);
      await blockBlobClient.delete();

      this.logger.debug('Done renaming file', oldFileName, 'to', newFileName);
    } catch (err) {
      this.logger.error('Error renaming file', err);
    }
  }

  async createDirectoryTreeForFileInVault(fileName: string) {
    if (this.isActive === false) throw 'SyncService is not initialized';

    const directoryTree = fileName.split('/').slice(0, -1).join('/');

    if (directoryTree === '') return;
    if (this.vault.getAbstractFileByPath(directoryTree)) return;

    try {
      this.logger.debug('[SyncService.createDirectoryTreeForFileInVault] Creating directory tree', directoryTree);

      await this.vault.createFolder(directoryTree);

      this.logger.debug('[SyncService.createDirectoryTreeForFileInVault] Done creating directory tree for file', fileName);
    } catch (err) {
      this.logger.error('[SyncService.createDirectoryTreeForFileInVault] Error creating directory tree for file', fileName, err);
    }
  }

  async downloadFile(fileName: string) {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      this.logger.debug('[SyncService.downloadFile] Downloading file', fileName);

      const blockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${fileName}`);
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

      this.logger.debug('[SyncService.downloadFile] Done downloading file', fileName);

      return downloaded?.toString();
    } catch (err) {
      this.logger.error('[SyncService.downloadFile] Error downloading file', err);
    }
  }

  async deleteFile(fileName: string) {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      this.logger.debug('[SyncService.deleteFile] Deleting file', fileName);

      const blockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${fileName}`);

      await blockBlobClient.deleteIfExists();

      this.logger.debug('[SyncService.deleteFile] Done deleting file', fileName);
    } catch (err) {
      this.logger.error('[SyncService.deleteFile] Error deleting file', err);
    }
  }

  async getBlobFileStats(fileName: string) {
    const fileStats = {
      lastModified: 0,
      createdOn: 0,
      contentType: '',
      contentLength: 0,
    };

    try {
      if (this.isActive === false) return fileStats;

      const blockBlobClient = this.containerClient.getBlockBlobClient(`${this.baseDirectory}${fileName}`);
      const properties = await blockBlobClient.getProperties();

      this.logger.debug('[SyncService.getBlobFileStats] File stats for', fileName, properties);

      return {
        ...fileStats,
        lastModified: Math.floor(properties.lastModified?.getTime() ?? 0),
        createdOn: Math.floor(properties.createdOn?.getTime() ?? 0),
        contentType: properties.contentType ?? '',
        contentLength: properties.contentLength ?? 0,
      };
    } catch (err) {
      this.logger.error('[SyncService.getBlobFileStats] Error getting file stats', err);

      return {
        ...fileStats,
        lastModified: 0,
        createdOn: 0,
        contentType: '',
        contentLength: 0,
      };
    }
  }

  async uploadFromVault() {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      const blobs = this.containerClient.listBlobsFlat({ prefix: this.baseDirectory, includeDeleted: true });
      const vaultFiles = this.vault.getMarkdownFiles();
      const blobNames = new Set<string>();
      const deletedBlobs = new Set<string>();

      for await (const blob of blobs) {
        const blobName = blob.name.replace(this.baseDirectory, '');

        if (blob.deleted) {
          this.logger.debug('[SyncService.uploadFromVault] File', blobName, 'has been deleted from the container, skipping');
          deletedBlobs.add(blobName);

          continue;
        }

        blobNames.add(blobName);
      }

      for (const file of vaultFiles) {
        if (!blobNames.has(file.path) && !deletedBlobs.has(file.path)) {
          const fileContent = await this.vault.cachedRead(file);
          const fileLength = fileContent.length;

          this.logger.debug('[SyncService.uploadFromVault] Uploading file', file.path);

          await this.uploadFile({
            fileName: file.path,
            fileContent: new Blob([fileContent]),
            fileLength,
          });

          this.logger.debug('[SyncService.uploadFromVault] Done uploading file', file.path);
        }
      }

      for (const file of vaultFiles) {
        const blobStat = await this.getBlobFileStats(file.path);

        if (blobStat.lastModified < file.stat.mtime) {
          this.logger.debug('[SyncService.uploadFromVault] File', file.path, 'has been modified more recently than the container');

          const fileContent = await this.vault.cachedRead(file);
          const fileLength = fileContent.length;

          this.logger.debug('[SyncService.uploadFromVault] Uploading file', file.path);

          await this.uploadFile({
            fileName: file.path,
            fileContent: new Blob([fileContent]),
            fileLength,
          });

          this.logger.debug('[SyncService.uploadFromVault] Done uploading file', file.path);
        }
      }
    } catch (err) {
      this.logger.error('[SyncService.uploadFromVault] Error uploading files', err);
    }
  }

  async deleteSoftDeletesFromVault() {
    if (this.isActive === false) throw 'SyncService is not initialized';

    this.logger.debug('[SyncService.deleteSoftDeletesFromVault] Deleting soft deleted blobs from the vault');

    const blobs = this.containerClient.listBlobsFlat({ prefix: this.baseDirectory, includeDeleted: true });
    const vaultFiles = this.vault.getMarkdownFiles();

    for await (const blob of blobs) {
      if (!blob.deleted) continue;

      const blobName = blob.name.replace(this.baseDirectory, '');
      const vaultFile = vaultFiles.find((file) => file.path === blobName);

      if (!vaultFile) {
        this.logger.debug('[SyncService.deleteSoftDeletesFromVault] File', blobName, 'does not exist in the vault, skipping');

        continue;
      }

      try {
        this.logger.debug('[SyncService.deleteSoftDeletesFromVault] Deleting file from vault', blobName);

        await this.vault.delete(vaultFile);

        this.logger.debug('[SyncService.downloadToVault] Done deleting soft deleted file from vault', blobName);
      } catch (err) {
        this.logger.error('[SyncService.deleteSoftDeletesFromVault] Error deleting soft deleted file from vault', blobName, err);
      }
    }
  }

  async downloadToVault() {
    if (this.isActive === false) throw 'SyncService is not initialized';

    this.logger.debug('[SyncService.downloadToVault] Downloading all files from the container');

    const blobs = this.containerClient.listBlobsFlat({ prefix: this.baseDirectory });
    const vaultFiles = this.vault.getMarkdownFiles();

    for await (const blob of blobs) {
      if (blob.deleted) {
        this.logger.debug('[SyncService.downloadToVault] File', blob.name, 'has been deleted from the container, skipping');
        continue;
      }

      const blobName = blob.name.replace(this.baseDirectory, '');

      this.logger.debug('[SyncService.downloadToVault] Found file', blobName);

      if (vaultFiles.find((file) => file.path === blobName)) {
        this.logger.debug('[SyncService.downloadToVault] File', blobName, 'already exists in the vault, skipping');

        continue;
      }

      this.logger.debug('[SyncService.downloadToVault] Downloading latest version of', blobName, 'from the container');

      try {
        const blobFileContent = await this.downloadFile(blobName);

        this.logger.debug('[SyncService.downloadToVault] Creating file', blobName, 'in the vault');

        await this.createDirectoryTreeForFileInVault(blobName);
        await this.vault.create(blobName, blobFileContent ?? '');

        this.logger.debug('[SyncService.downloadToVault] Done downloading latest version of', blobName, 'from the container');
      } catch (err) {
        this.logger.error('[SyncService.downloadToVault] Error downloading latest version of', blobName, 'from the container', err);
      }

      const file = vaultFiles.find((file) => file.path === blobName);

      if (!file) {
        this.logger.debug('[SyncService.downloadToVault] File', blobName, 'does not exist in the vault, skipping');

        continue;
      }

      const blobStat = await this.getBlobFileStats(file.path);

      this.logger.debug(blobStat.lastModified, file.stat.mtime);
      this.logger.debug(blobStat.createdOn, file.stat.ctime);

      if (blobStat.lastModified > file.stat.mtime) {
        this.logger.debug('[SyncService.downloadToVault] Downloading latest version of', blobName, 'from the container');

        try {
          const blobFileContent = await this.downloadFile(blobName);

          await this.vault.modify(file, blobFileContent ?? '');

          this.logger.debug('[SyncService.downloadToVault] Done downloading latest version of', blobName, 'from the container');
        } catch(err) {
          this.logger.error('[SyncService.downloadToVault] Error downloading latest version of', blobName, 'from the container', err);
        }
      }
    }
  }

  async fullSync() {
    try {
      if (this.isActive === false) throw 'SyncService is not initialized';

      this.logger.info('[SyncService.fullSync] Starting full sync');

      await this.downloadToVault();
      await this.deleteSoftDeletesFromVault();
      await this.uploadFromVault();

      this.logger.info('[SyncService.fullSync] Finished full sync');
    } catch (err) {
      this.logger.error('[SyncService.fullSync] Error during full sync', err);
    }
  }
}

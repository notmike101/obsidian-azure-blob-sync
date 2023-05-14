import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import type { TFile, Vault } from 'obsidian';
import { isFolder } from './utils';

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

  constructor(options: ISyncServiceOptions) {
    this.#baseDirectory = options.baseDirectory;
    this.#accountName = options.accountName;
    this.#sasToken = options.sasToken;
    this.#containerName = options.containerName;
    this.#vault = options.vault;
    this.debug = options.debug;

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Account Name is', this.#accountName);
      console.log('[Azure Blob Sync] Container Name is', this.#containerName);
      console.log('[Azure Blob Sync] Base Directory is', this.#baseDirectory);
    }
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

      if (this.debug === true) {
        console.log('[Azure Blob Sync] SyncService initialized');
      }
    } catch(err) {
      if (this.debug === true) {
        console.error('[Azure Blob Sync] Error initializing SyncService', err);
      }
    }
  }

  async uploadFile(file: { fileName: string; fileContent: Blob; fileLength: number}) {
    try {
      if (this.#isActive === false) return;

      const { fileName, fileContent, fileLength } = file;

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Uploading file', fileName);
      }

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${fileName}`);

      await blockBlobClient.upload(fileContent, fileLength);

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Done uploading file', fileName);
      }
    } catch (err) {
      if (this.debug === true) {
        console.error('[Azure Blob Sync] Error uploading file', err);
      }
    }
  }

  async renameFile(oldFileName: string, newFileName: string) {
    try {
      if (this.#isActive === false) return;

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Renaming file', oldFileName, 'to', newFileName);
      }

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${oldFileName}`);
      const newBlockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${newFileName}`);

      await newBlockBlobClient.beginCopyFromURL(blockBlobClient.url);
      await blockBlobClient.delete();

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Renamed file', oldFileName, 'to', newFileName);
      }
    } catch (err) {
      if (this.debug === true) {
        console.error('[Azure Blob Sync] Error renaming file', err);
      }
    }
  }

  async downloadFile(fileName: string) {
    try {
      if (this.#isActive === false) return;

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Downloading file', fileName);
      }

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

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Downloaded file', fileName);
      }

      return downloaded?.toString();
    } catch (err) {
      if (this.debug === true) {
        console.error('[Azure Blob Sync] Error downloading file', err);
      }
    }
  }

  async deleteFile(fileName: string) {
    try {
      if (this.#isActive === false) return;

      const blockBlobClient = this.#containerClient.getBlockBlobClient(`${this.#baseDirectory}${fileName}`);

      await blockBlobClient.delete();
    } catch (err) {
      if (this.debug === true) {
        console.error('[Azure Blob Sync] Error deleting file', err);
      }
    }
  }

  async uploadAllFilesInVault() {
    if (this.#isActive === false) return;

    const vaultFiles = this.#vault.getMarkdownFiles();

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Found', vaultFiles.length, 'files in vault', vaultFiles);
    }

    for await (const file of vaultFiles) {
      const { path: fileName } = file;
      const fileContent = await this.#vault.cachedRead(file);
      const fileLength = fileContent.length;

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Uploading file', fileName);
      }

      await this.uploadFile({
        fileName,
        fileContent: new Blob([fileContent]),
        fileLength,
      });

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Finished uploading file', fileName);
      }
    }

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Finished uploading all files in vault');
    }
  }

  async downloadAllFilesInContainer() {
    if (this.#isActive === false) return;

    const blobs = this.#containerClient.listBlobsFlat({ prefix: this.#baseDirectory });
    const vaultFiles = this.#vault.getMarkdownFiles();
    const blobNames = new Set<string>();

    for await (const blob of blobs) {
      blobNames.add(blob.name.replace(this.#baseDirectory, ''));
    }

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Found', blobNames.size, 'files in container', blobNames.keys());
    }

    for (const file of vaultFiles) {
      if (!blobNames.has(file.path)) continue;

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Downloading latest version of', file.path, 'from the container');
      }

      const blobFileContent = await this.downloadFile(file.path);
      await this.#vault.modify(file, blobFileContent ?? '');

      blobNames.delete(file.path);

      if (this.debug === true) {
        console.log('[Azure Blob Sync] Finished downloading latest version of', file.path, 'from the container');
      }
    }

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Remaining untracked files in container', blobNames.keys());
    }

    for (const blobName of blobNames.keys()) {
      // Split the full blobName by the / character and filter out any empty strings
      const pathFolders = blobName.split('/').filter((pathFolder) => pathFolder !== '');

      for (let i = 0; i < pathFolders.length - 1; i++) {
        const pathFolder = pathFolders.slice(0, i + 1).join('/');

        if (this.debug === true) {
          console.log('[Azure Blob Sync] Checking if', pathFolder, 'exists');
        }

        const doesPathExist = await this.#vault.adapter.exists(pathFolder);

        if (doesPathExist) continue;

        if (this.debug === true) {
          console.log('[Azure Blob Sync] Creating folder', pathFolder);
        }
        await this.#vault.createFolder(pathFolder);
      }

      const blobFileContent = await this.downloadFile(blobName);

      if (!blobFileContent) continue;

      const doesFileOrFolderExist = await this.#vault.adapter.exists(blobName);

      if (doesFileOrFolderExist) {
        const existingFile = await this.#vault.getAbstractFileByPath(blobName);

        if (existingFile && isFolder(existingFile)) {
          if (this.debug === true) {
            console.log('[Azure Blob Sync]', blobName, 'is a folder, skipping');
          }

          continue;
        }

        if (this.debug === true) {
          console.log('[Azure Blob Sync] Modifying file', blobName);
        }

        await this.#vault.modify((existingFile as TFile), blobFileContent);
      } else {
        if (this.debug === true) {
          console.log('[Azure Blob Sync] Creating file', blobName);
        }

        await this.#vault.create(blobName, blobFileContent ?? '');
      }
    }

    if (this.debug === true) {
      console.log('[Azure Blob Sync] Finished downloading all files in container');
    }
  }
}

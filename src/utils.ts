import { TAbstractFile, TFile, TFolder, Vault } from 'obsidian';

export const isFile = (fileOrFolder: TAbstractFile) => {
  return (fileOrFolder instanceof TFile);
};

export const isFolder = (fileOrFolder: TAbstractFile) => {
  return (fileOrFolder instanceof TFolder);
};

export const doesFileOrFolderExist = (vault: Vault , fileOrFolder: string) => {
  return !!vault.getAbstractFileByPath(fileOrFolder);
};

import { TAbstractFile, TFile } from 'obsidian';

export const isFile = (fileOrFolder: TAbstractFile) => {
  return !!(fileOrFolder as TFile).stat;
};

export const isFolder = (fileOrFolder: TAbstractFile) => {
  return !(fileOrFolder as TFile).stat;
};

# Obsidian Azure Blob Sync

This is an unofficial sync plugin for Obsidian that allows you to sync your vault to an Azure Blob Storage account, which can then be used to sync to other devices using the Obsidian client.

![GitHub manifest version](https://img.shields.io/github/manifest-json/v/notmike101/obsidian-azure-blob-sync/main?label=Version&style=for-the-badge) ![GitHub release (latest by SemVer)](https://img.shields.io/github/downloads/notmike101/obsidian-azure-blob-sync/latest/total?label=Downloads&style=for-the-badge) ![https://github.com/notmike101/obsidian-azure-blob-sync/releases/latest](https://img.shields.io/github/downloads/notmike101/obsidian-azure-blob-sync/total?label=All-time+Downloads&style=for-the-badge)

## Prerequesites

* An existing Azure Blob Storage account
* A container in the storage account to store the files with soft delete **ENABLED**
* A Shared Access Signature Token (SAS) for the storage account
* A properly configured CORS policy for the storage account (See #cors-policy)

## Download and Install

* Option 1. Use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) to install the plugin via `notmike101/obsidian-azure-blob-sync`.
* Option 2. Directly download the latest release from [GitHub](https://github.com/notmike101/obsidian-azure-blob-sync/releases/latest) and unzip into your vault's plugins folder.

## Client Configuration Options

When first loading the application, you will need to configure all available settings in the plugin settings area. These settings are:

| Setting | Description |
| ------- | ----------- |
| Storage Account Name | The name of the storage account you are using |
| Container Name | The name of the container you are using |
| Shared Access Signature Token | The token you created to access the storage account |
| Remote Vault Path | The path to the vault inside of the container |
| Sync on Startup | Whether or not to sync on startup |
| Sync on Interval | Whether or not to sync on the interval |
| Sync Interval | How often the plugin should check for changes to sync |

**NOTICE: YOU MUST PRESS THE SAVE BUTTON FOR THE SETTINGS TO BE SAVED. NEGLECTING TO DO THIS WILL RESULT IN YOUR CONFIGURATION BEING LOST.**

This is done to prevent the plugin from saving and using invalid configuration data.

## Soft delete!?

Soft delete for blobs should be enabled to ensure that deleted files sync across clients. If you do not enable soft delete, you will need to manually delete files from the container AND every vault before it syncs again to ensure that the files are properly deleted.

This is configured in your storage account in "Data protection". You can set the retention period for deleted blobs to whatever you want, but I recommend 7 days, but it really depends on how frequently you use your other synced devices.

## A Shared Access Token!? What the heck?

We need a shared access token only because the NPM package [@azure/storage-blob](https://www.npmjs.com/package/@azure/storage-blob) does not play well with Electron, which prevents us from properly authorizing an application to access the storage account.

Your Shared Access Signature Token stays on your machine and is never sent anywhere except Microsoft's REST API to interface with the storage account.

The length of time the token is valid for and the permissions it has it up to you, but I recommend creating a token that expires in an absurdly long time with every permission available.


## Blob Container CORS Policy Configuration

You **MUST** configure the Resource sharing (CORS) options on your Azure Blob Storage account to allow the plugin to access the files inside of the container. Without this, the plugin will not work either on desktop or mobile, whichever platform you choose to ignore.

To configure these, log into the Azure portal and open your storage account settings. Find the "Resource sharing (CORS)" area, then add the following fields:

| Allowed origins  | Allowed methods | Allowed headers | Exposed headers | Max age |
| ---------------- | --------------- | --------------- | -------------- | ------- |
| app:obsidian.md  | DELETE, GET, HEAD, MERGE, POST, OPTIONS, PUT | * | | 0 |
| http<no-link>://localhost | DELETE, GET, HEAD, MERGE, POST, OPTIONS, PUT | * | | 0 |

**The first one is for the desktop application, the second is for Android. I HAVE NOT FIGURED OUT THE CORS ORIGIN FOR IOS.**
**If you need iOS support, replace all allowed origins with `*`.**

**BE SURE TO SAVE**

## Client Limitations

* **No conflict resolution, diff, or patching**. All files and folders are overwritten with the latest version. This is due to the way the Azure Blob Storage API works. If you need conflict resolution, I recommend using a different sync plugin unless you have an idea on how to resolve this issue.
* **Exposed SAS in data.json**. The SAS token is stored in the data.json file in plain text. This is due to the way the Azure Blob Storage API works. I'm currently exploring ideas regarding encrypting this key, but if you have any idea on how to handle this, please let me know.
* **This is not free**. Azure services are not free. If you use this, be prepared to pay for the storage you use. I am not responsible for any charges you incur while using this plugin.

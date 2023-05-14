# Obsidian Azure Blob Sync

You **MUST** create a container (If one does not already exist) in your Azure Blob Storage account before using this plugin.

You **MUST** create a Share Access Token for your storage account. The length of time the token is valid for is up to you. The plugin will use this token to access your storage account. You can revoke the token at any time. For simplicity, I recommend creating a token that never expires with every permission available. You can always revoke the token later if you need to.

You **MUST** configure the Resource sharing (CORS) options on your Azure Blob Storage account to allow the plugin to access the files.

| Allowed origins | Allowed methods | Allowed headers | Exposed headers | Max age |
| --------------- | --------------- | --------------- | -------------- | ------- |
| app:obsidian.md | DELETE, GET, HEAD, MERGE, POST, OPTIONS, PUT | * | * | 0 |

## Configuration Options

**Account Name**: The name of your Azure Storage Account.

**Shared Access Signature Token**: The **QUERY STRING** portion of the SAS token. This is the part of the token that starts with `?sv=`. The plugin will append the rest of the token to the end of this string.

**Container Name**: The name of the container in your Azure Storage Account.

**Base Directory**: The base directory in your container to store your files. This is optional. If you do not specify a base directory, the plugin will store your files in the root of your container.

**Debug**: Enable console output for debugging purposes.

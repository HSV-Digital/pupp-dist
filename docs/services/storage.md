# Storage

Project B uses Azure Blob Storage for generated assets and optional CDN fronting.

## What storage is used for

Blob-backed workflows include:

- generated asset uploads
- async PDF output
- generated proposal bundles and related downloadable artifacts

The app can start without Blob Storage, but these workflows can fail until storage is configured.

## Current storage model

The code currently assumes Azure Blob Storage semantics. There is no generic S3-style storage adapter in the current repo.

## Required values

- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_NAME`

One of the following must also be true:

- `AZURE_STORAGE_ACCOUNT_KEY` is set
- the API runtime has a working Azure managed identity that `DefaultAzureCredential` can use

## Optional values

- `AZURE_CDN_BASE_URL`
- `BLOB_SAS_EXPIRY_SECONDS`

## Setup outline

1. Create an Azure Storage Account.
2. Create or choose a blob container.
3. Set:
   - `AZURE_STORAGE_ACCOUNT_NAME`
   - `AZURE_STORAGE_CONTAINER_NAME`
4. Either:
   - set `AZURE_STORAGE_ACCOUNT_KEY`, or
   - grant the API runtime managed identity access to the storage account
5. Optionally set `AZURE_CDN_BASE_URL` if you front the blobs with CDN.

## CDN behavior

If `AZURE_CDN_BASE_URL` is blank, the app returns direct blob URLs.

If it is set, blob URLs are rewritten to the CDN origin before they are returned.

## Local development note

The current setup does not ship a local Blob emulator path. The storage client assumes Azure Blob host conventions.

For local development, either:

- use a real Azure Storage account, or
- avoid blob-backed workflows during initial smoke testing

## Common pitfalls

- leaving `AZURE_STORAGE_ACCOUNT_NAME` blank and expecting generation flows to work
- configuring a CDN URL that does not front the same blob content
- running with managed identity but not granting the API runtime storage permissions

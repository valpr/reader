/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import { oneDriveTokenEndpoint } from '$lib/data/env';
import { ApiStorageHandler } from '$lib/data/storage/handler/api-handler';
import { BaseStorageHandler, type ExternalFile } from '$lib/data/storage/handler/base-handler';
import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
import {
  storageOAuthTokens,
  storageConnectionStates$,
  getConnectionState,
  StorageConnectionState
} from '$lib/data/storage/storage-oauth-manager';
import { database, oneDriveStorageSource$ } from '$lib/data/store';
import pLimit from 'p-limit';

interface OneDriveFile extends ExternalFile {
  thumbnails?: ExternalThumbnail[];
  file: Record<string, string>;
  folder: Record<string, string>;
}

interface BatchRequest {
  id: string;
  method: string;
  url: string;
  body?: string;
  headers?: string;
}

interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body: BatchResponseBody;
}

interface BatchResponseBody {
  value: OneDriveFile[];
}

interface ExternalThumbnail {
  id: string;
  large?: ExternalThumbnailData;
  medium?: ExternalThumbnailData;
  small?: ExternalThumbnailData;
}

interface ExternalThumbnailData {
  height: number;
  width: number;
  url: string;
}

export class OneDriveStorageHandler extends ApiStorageHandler {
  private baseEndpoint = 'https://graph.microsoft.com/v1.0/me/drive/items';

  constructor(window: Window) {
    super(StorageKey.ONEDRIVE, window, oneDriveTokenEndpoint);
  }

  setInternalSettings(storageSourceName: string) {
    const newStorageSource = storageSourceName || oneDriveStorageSource$.getValue();

    if (newStorageSource !== this.storageSourceName) {
      this.clearData();
    }

    this.storageSourceName = newStorageSource;
  }

  async getBookList() {
    if (!this.dataListFetched) {
      database.listLoading$.next(true);

      try {
        await this.ensureTitle();

        const remoteFolders = await this.list(this.rootId);
        const batchRequests: BatchRequest[][] = [];
        const batchIdToTitle = new Map<string, string>();
        const titleIdToName = new Map<string, string>();
        const listParams = new URLSearchParams();

        listParams.append('select', `id,name`);
        listParams.append('expand', `thumbnails(select=large)`);

        for (let index = 0, { length } = remoteFolders; index < length; index += 20) {
          const iteration = remoteFolders.slice(index, index + 20);
          const requests: BatchRequest[] = [];

          for (let index2 = 0, { length: length2 } = iteration; index2 < length2; index2 += 1) {
            const remoteFolder = iteration[index2];
            const title = BaseStorageHandler.desanitizeFilename(remoteFolder.name);
            const id = `${batchRequests.length}_${requests.length}`;

            this.titleToId.set(title, remoteFolder.id);
            titleIdToName.set(remoteFolder.id, title);
            batchIdToTitle.set(id, remoteFolder.id);

            requests.push({
              id,
              method: 'GET',
              url: `/me/drive/items/${remoteFolder.id}/children?${listParams.toString()}`
            });
          }

          if (requests.length) {
            batchRequests.push(requests);
          }
        }

        if (batchRequests.length) {
          const listLimiter = pLimit(1);
          const listTasks: Promise<void>[] = [];

          batchRequests.forEach((requests: BatchRequest[]) =>
            listTasks.push(
              listLimiter(async () => {
                const { responses } = await this.request(
                  'https://graph.microsoft.com/v1.0/$batch',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      requests
                    })
                  }
                );

                const responseWithError = responses.find(
                  (response: BatchResponse) => response.status < 200 || response.status > 299
                );

                if (responseWithError) {
                  const { body } = responseWithError;

                  throw new Error(
                    body.error_description ||
                      body.error?.message ||
                      body.error ||
                      'Received error on data retrival'
                  );
                }

                for (let index = 0, { length } = responses; index < length; index += 1) {
                  const response = responses[index];
                  const remoteFiles = response.body?.value || [];
                  const externalId = batchIdToTitle.get(response.id) || '';
                  const title = titleIdToName.get(externalId);

                  if (title && externalId) {
                    this.setTitleData(title, remoteFiles);
                  }
                }
              })
            )
          );

          await Promise.all(listTasks).catch((error) => {
            listLimiter.clearQueue();
            throw error;
          });
        }

        this.dataListFetched = true;
      } catch (error) {
        this.clearData();
        throw error;
      }
    }

    return [...this.titleToBookCard.values()];
  }

  async checkHasData(): Promise<{ connected: boolean; hasData: boolean }> {
    const sourceName =
      this.storageSourceName ||
      oneDriveStorageSource$.getValue() ||
      StorageSourceDefault.ONEDRIVE_DEFAULT;
    const token = storageOAuthTokens.get(sourceName);
    const connState =
      storageConnectionStates$.getValue()[sourceName] || getConnectionState(sourceName);
    const isConnected =
      (!!token && token.expiration > Date.now()) || connState === StorageConnectionState.CONNECTED;

    if (!isConnected || !token || token.expiration <= Date.now()) {
      return { connected: isConnected, hasData: false };
    }

    if (this.titleToBookCard.size > 0) {
      return { connected: true, hasData: true };
    }

    try {
      this.setInternalSettings(sourceName);
      await this.ensureTitle(BaseStorageHandler.rootName, 'root', true);
      if (!this.rootId) {
        return { connected: true, hasData: false };
      }

      const remoteFolders = await this.list(this.rootId);
      return { connected: true, hasData: remoteFolders.length > 0 };
    } catch {
      return { connected: true, hasData: false };
    }
  }

  protected async ensureTitle(
    name = BaseStorageHandler.rootName,
    _parent = 'root',
    readOnly = false
  ) {
    if (name === BaseStorageHandler.rootName && this.rootId) {
      return this.rootId;
    }

    const externalId = this.titleToId.get(name);

    if (externalId) {
      return externalId;
    }

    let titleId = '';

    if (name === BaseStorageHandler.rootName) {
      const approotParams = new URLSearchParams();
      approotParams.append('select', 'id,name');
      const approotResponse = await this.request(
        `https://graph.microsoft.com/v1.0/me/drive/special/approot?${approotParams.toString()}`
      );
      titleId = approotResponse?.id || '';
    } else if (this.rootId) {
      // One Drive Bug (?) - with non latin characters it will return no filter result so we need to refetch all folders
      const remoteFolders = await this.list(this.rootId);

      for (let index = 0, { length } = remoteFolders; index < length; index += 1) {
        const remoteFolder = remoteFolders[index];
        const title = BaseStorageHandler.desanitizeFilename(remoteFolder.name);

        this.titleToId.set(title, remoteFolder.id);

        if (title === name) {
          titleId = remoteFolder.id;
        }
      }

      if (!titleId && !readOnly) {
        const sanitizedName = BaseStorageHandler.sanitizeForFilename(name);
        const params = new URLSearchParams();
        params.append('select', `id,name`);

        const response = await this.request(
          `${this.baseEndpoint}/${this.rootId}/children?${params.toString()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: sanitizedName,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail'
            })
          }
        );

        titleId = response.id;
      }
    } else {
      throw new Error('RootId required for search');
    }

    if (titleId) {
      this.titleToId.set(name, titleId);
    }

    if (titleId && name === BaseStorageHandler.rootName) {
      this.rootId = titleId;
    }

    if (!titleId && name === BaseStorageHandler.rootName) {
      throw new Error('Root folder not found');
    }

    return titleId;
  }

  protected async getExternalFiles(remoteTitleId: string, titleOverride?: string) {
    const title = titleOverride || this.currentContext.title;
    if ((!this.cacheStorageData || !this.dataListFetched) && !this.titleToFiles.has(title)) {
      const externalFiles = await this.list(remoteTitleId, true, true);

      if (externalFiles.length) {
        this.setTitleData(title, externalFiles);
      }
    }

    return this.titleToFiles.get(title) || [];
  }

  protected async setRootFiles() {
    if ((!this.cacheStorageData || !this.rootFileListFetched) && !this.rootFiles.size) {
      const rootFiles = await this.list(this.rootId, false, true);

      for (let index = 0, { length } = rootFiles; index < length; index += 1) {
        const rootFile = rootFiles[index];

        this.setRootFile(rootFile.name, rootFile);
      }

      this.rootFileListFetched = true;
    }
  }

  protected retrieve(
    file: OneDriveFile,
    typeToRetrieve: XMLHttpRequestResponseType,
    progressBase = 1
  ) {
    return this.request(
      `${this.baseEndpoint}/${file.id}/content`,
      { trackDownload: true },
      typeToRetrieve,
      progressBase
    );
  }

  protected async upload(
    folderId: string,
    name: string,
    files: OneDriveFile[],
    remoteFile?: OneDriveFile,
    body?: Blob | string,
    rootFilePrefix?: string,
    progressBase = 0.8,
    titleOverride?: string
  ) {
    const params = new URLSearchParams();
    params.append('select', `id,name`);

    if (body) {
      const { uploadUrl: uploadUrlResponse } = await this.request(
        `${this.baseEndpoint}/${
          remoteFile ? `${remoteFile.id}` : `${folderId}:/${encodeURIComponent(name)}:`
        }/createUploadSession`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: {
              name: remoteFile?.name || name
            }
          })
        }
      );

      const url = new URL(uploadUrlResponse);
      const searchParams = [...url.searchParams];
      const uploadUrl = `${url.origin}${url.pathname}`;

      params.delete('select');

      for (let index = 0, { length } = searchParams; index < length; index += 1) {
        const [paramName, paramValue] = searchParams[index];

        params.append(paramName, paramValue);
      }

      params.append('select', `id,name`);

      if (!uploadUrl) {
        throw new Error('Upload url was not returned');
      }

      try {
        const byteSize = body instanceof Blob ? body.size : new Blob([body]).size;
        const response = await this.request(
          `${uploadUrl}?${params.toString()}`,
          {
            method: 'PUT',
            headers: { 'Content-Range': `bytes 0-${byteSize - 1}/${byteSize}` },
            body,
            trackUpload: true,
            skipAuth: true
          },
          'json',
          progressBase
        );

        if (remoteFile && name !== remoteFile.name) {
          const renameResponse = await this.rename(
            name,
            files,
            remoteFile,
            params,
            rootFilePrefix,
            titleOverride
          );

          return renameResponse;
        }

        this.updateAfterUpload(
          response.id,
          response.name,
          files,
          remoteFile,
          {
            thumbnails: response.thumbnails
          },
          rootFilePrefix,
          titleOverride
        );

        return response;
      } catch (error) {
        await this.request(uploadUrl, { method: 'DELETE' }).catch(() => {
          // no-op
        });
        throw error;
      }
    }

    if (!remoteFile) {
      throw new Error('Renaming requires a remote id');
    }

    const renameResponse = await this.rename(
      name,
      files,
      remoteFile,
      params,
      rootFilePrefix,
      titleOverride
    );

    return renameResponse;
  }

  protected executeDelete(id: string) {
    return this.request(`${this.baseEndpoint}/${id}`, { method: 'DELETE' });
  }

  private async list(
    parent = 'root',
    withThumbnail = false,
    listFiles = false,
    files: OneDriveFile[] = [],
    nextLink = ''
  ) {
    let response;

    if (nextLink) {
      response = await this.request(nextLink);
    } else {
      const targetParent = parent === 'root' && this.rootId ? this.rootId : parent;
      const params = new URLSearchParams();

      params.append('select', `id,name,file,folder`);

      if (!listFiles) {
        params.append('filter', 'folder ne null');
      }

      if (withThumbnail) {
        params.append('expand', `thumbnails`);
      }

      response = await this.request(
        `${this.baseEndpoint}/${targetParent}/children?${params.toString()}`
      );
    }

    if (response) {
      files.push(
        ...(response.value || []).filter(
          (item: OneDriveFile) => (listFiles && !!item.file) || (!listFiles && !!item.folder)
        )
      );

      if (response['@odata.nextLink']) {
        await this.list(parent, withThumbnail, listFiles, files, response?.['@odata.nextLink']);
      }
    }

    return files;
  }

  private async setTitleData(title: string, files: OneDriveFile[]) {
    if (!files.length) {
      return;
    }

    // A folder without a bookdata_ file is not a book (e.g. a leftover
    // statistics-only archive after deletion, or an orphaned cover).
    // Keep the file list cached so stats can still merge on re-import,
    // but don't surface a library card for it.
    const hasBookData = files.some((file) => file.name.startsWith('bookdata_'));

    this.titleToFiles.set(title, files);

    if (!hasBookData) {
      this.titleToBookCard.delete(title);
      return;
    }

    const bookCard: BookCardProps = {
      id: BaseStorageHandler.getDummyId(),
      title,
      imagePath: '',
      characters: 0,
      lastBookModified: 0,
      lastBookOpen: 0,
      progress: 0,
      lastBookmarkModified: 0,
      isPlaceholder: false
    };

    for (let index = 0, { length } = files; index < length; index += 1) {
      const file = files[index];

      if (file.name.startsWith('bookdata_')) {
        const { characters, lastBookModified, lastBookOpen } = BaseStorageHandler.getBookMetadata(
          file.name
        );

        bookCard.characters = characters;
        bookCard.lastBookModified = lastBookModified;
        bookCard.lastBookOpen = lastBookOpen;
      } else if (file.name.startsWith('progress_')) {
        const { progress, lastBookmarkModified } = BaseStorageHandler.getProgressMetadata(
          file.name
        );

        bookCard.progress = progress;
        bookCard.lastBookmarkModified = lastBookmarkModified;
      } else if (file.name.startsWith('cover_') && file.thumbnails?.[0].large?.url) {
        bookCard.imagePath = file.thumbnails?.[0].large?.url;
      }
    }

    this.titleToBookCard.set(title, bookCard);
  }

  private async rename(
    name: string,
    files: OneDriveFile[],
    remoteFile: OneDriveFile,
    params: URLSearchParams,
    rootFilePrefix?: string,
    titleOverride?: string
  ) {
    const renameResponse = await this.request(
      `${this.baseEndpoint}/${remoteFile.id}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }
    );

    this.updateAfterUpload(
      renameResponse.id,
      renameResponse.name,
      files,
      remoteFile,
      {
        thumbnails: renameResponse?.thumbnails || []
      },
      rootFilePrefix,
      titleOverride
    );

    return renameResponse;
  }
}

import deferredPromise from '../../helpers/cancellablePromise';

import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import {ActiveAccountNumber} from '../accounts/types';
import CacheStorageController from '../files/cacheStorage';
import {logger} from '../logger';
import {get500ErrorResponse} from '../serviceWorker/errors';
import {serviceMessagePort} from '../serviceWorker/index.service';

const cacheStorage = new CacheStorageController('cachedHlsQualityFiles');

const ctx = self as any as ServiceWorkerGlobalScope;


export const log = logger('SW-HLS');

export type HlsStreamUrlParams = {
  docId: string;
  dcId: number;
  size: number;
  mimeType: string;
};

/**
 * To be used in the service worker
 */
export async function onHlsQualityFileFetch(event: FetchEvent, params: string, search: string) {
  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  try {
    const docId = params;

    const client = await ctx.clients.get(event.clientId);
    const accountNumber = getCurrentAccountFromURL(client.url);

    const file = await getHlsQualityFile(docId, accountNumber);
    const fileString = await file.text();

    // log.info('original hls quality file', fileString);

    const replacedContent = await replaceQualityFileWithLocalURLs(fileString, accountNumber);
    // log.info('replaced hls quality file', replacedContent);

    deferred.resolve(new Response(replacedContent));
  } catch(e) {
    deferred.resolve(get500ErrorResponse());
    log.error(e);
  }
}

function getHlsQualityCacheFilename(docId: string) {
  return `hls_quality_${docId}`;
}

async function getHlsQualityFile(docId: string, accountNumber: ActiveAccountNumber): Promise<Blob> {
  try {
    // throw '';
    const file = await cacheStorage.getFile(getHlsQualityCacheFilename(docId));
    log.info('using cached quality file', docId);
    return file;
  } catch{
    log.info('fetching quality file', docId);
    const file = await serviceMessagePort.invoke('downloadDoc', {docId, accountNumber});
    cacheStorage.saveFile(getHlsQualityCacheFilename(docId), file);
    return file;
  }
}

async function replaceQualityFileWithLocalURLs(fileString: string, accountNumber: ActiveAccountNumber) {
  const regex = 'mtproto:(\\d+)';

  const match = fileString.match(new RegExp(regex));
  if(!match) throw new Error('Wrong Hls quality file format');

  const targetDocId = match[1];

  log.info('targetDocId', targetDocId);

  if(!targetDocId) throw new Error('Wrong Hls quality file format');

  const doc = await serviceMessagePort.invoke('requestDoc', {docId: targetDocId, accountNumber});

  const params: HlsStreamUrlParams = {
    docId: targetDocId,
    dcId: doc.dc_id,
    size: doc.size,
    mimeType: doc.mime_type
  };
  const pathname = `hls_stream/${encodeURIComponent(JSON.stringify(params))}`;

  const targetFileURL = new URL(pathname, location.origin).toString();

  const replacedContent = fileString.replace(new RegExp(regex, 'g'), targetFileURL);

  return replacedContent;
}

/**
 * Share-link loader for Kiri Engine and other supported public 3D sources.
 *
 * Only CORS-blocked share-page resolution uses the lightweight /resolve
 * Pages Function. Model binaries and camera metadata are downloaded directly
 * from their source CDN by the browser.
 */

const RESOLVER_ENDPOINT = '/resolve';
const RESOLVER_TIMEOUT_MS = 20000;
const MODEL_IDLE_TIMEOUT_MS = 30000;

export async function extractPLYFromUrl(shareUrl, { forceRefresh = false } = {}) {
  const resolverQuery = new URLSearchParams({
    url: shareUrl,
    refresh: `${Date.now()}-${forceRefresh ? 'retry' : 'initial'}`
  });
  const resolverUrl = `${RESOLVER_ENDPOINT}?${resolverQuery.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVER_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(resolverUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Share link resolution timed out. Please check the network and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Share link resolution failed (${response.status}): ${message}`);
  }

  const result = await response.json();
  if (!result.plyUrl && !result.pcdUrl && !result.splatUrl && !result.sogUrl) {
    throw new Error('No supported SOG, PLY, or Splat model was found in this share link.');
  }

  if (result.camerasUrl) {
    try {
      const camerasResponse = await fetch(result.camerasUrl);
      if (!camerasResponse.ok) throw new Error(`HTTP ${camerasResponse.status}`);
      const cameras = await camerasResponse.json();
      const firstCamera = cameras.find(camera => camera.id === 0) || cameras[0];
      if (firstCamera?.position) result.initialCameraPosition = firstCamera.position;
    } catch (error) {
      console.warn('Direct camera metadata download failed:', error.message);
    }
  }

  return result;
}

/**
 * Download a SOG/PLY/Splat file directly from the source CDN. Luma distributes
 * its Gaussian PLY inside a ZIP archive, which is unpacked locally in the browser.
 */
export async function downloadPLY(url, onProgress) {
  const cleanUrl = url.replace(/\\u002F/g, '/');
  const pathname = new URL(cleanUrl).pathname.toLowerCase();
  const isZip = pathname.endsWith('.zip');
  const format = isZip
    ? 'ZIP'
    : pathname.endsWith('.sog')
    ? 'SOG'
    : pathname.endsWith('.splat')
      ? 'Splat'
      : pathname.endsWith('.ply')
        ? 'PLY'
        : null;
  if (!format) throw new Error('Unsupported model format. Expected SOG, ZIP, PLY, or Splat.');
  console.log(`Downloading ${format === 'ZIP' ? 'compressed PLY' : format} directly from CDN`);
  const controller = new AbortController();
  let idleTimeoutId = null;
  const refreshIdleTimeout = () => {
    clearTimeout(idleTimeoutId);
    idleTimeoutId = setTimeout(() => controller.abort(), MODEL_IDLE_TIMEOUT_MS);
  };

  try {
    refreshIdleTimeout();
    const response = await fetch(cleanUrl, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Direct model download failed (${response.status}): ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length')) || 0;
    let bytes;
    if (!response.body) {
      bytes = new Uint8Array(await response.arrayBuffer());
      onProgress?.(isZip ? 0.8 : 1);
    } else {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        refreshIdleTimeout();
        chunks.push(value);
        received += value.byteLength;
        if (contentLength > 0) {
          const downloadProgress = Math.min(received / contentLength, 1);
          onProgress?.(isZip ? downloadProgress * 0.8 : downloadProgress);
        }
      }

      if (received < 100) throw new Error('Downloaded model is too small to be valid.');
      bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      chunks.length = 0;
    }

    if (isZip) {
      bytes = await extractPlyFromZip(bytes);
      onProgress?.(1);
    }

    if (bytes.byteLength < 100) throw new Error('Downloaded model is too small to be valid.');
    if (format === 'PLY' || format === 'ZIP') {
      const header = new TextDecoder().decode(bytes.subarray(0, 3));
      if (header !== 'ply') throw new Error('Downloaded file is not a valid PLY file.');
    } else if (format === 'SOG') {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error('Downloaded file is not a valid SOG archive.');
      }
    }

    onProgress?.(1);
    return toArrayBuffer(bytes);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Model download stalled. Please check the network and try again.');
    }
    throw error;
  } finally {
    clearTimeout(idleTimeoutId);
  }
}

async function extractPlyFromZip(zipBytes) {
  let unzip;
  try {
    ({ unzip } = await import('fflate'));
  } catch (error) {
    throw new Error(`Unable to load ZIP support: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    unzip(zipBytes, {
      filter: file => file.name.toLowerCase().endsWith('.ply')
    }, (error, files) => {
      if (error) {
        reject(new Error(`Unable to unpack PLY archive: ${error.message}`));
        return;
      }
      const entry = Object.entries(files).find(([name]) => name.toLowerCase().endsWith('.ply'));
      if (!entry) {
        reject(new Error('The downloaded archive does not contain a PLY file.'));
        return;
      }
      resolve(entry[1]);
    });
  });
}

function toArrayBuffer(bytes) {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

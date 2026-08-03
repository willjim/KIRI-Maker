/**
 * Cloudflare Pages Function: resolve supported public share pages into model
 * asset URLs. Model files are downloaded directly from each source CDN.
 */

const SHARE_SOURCES = new Map([
  ['www.remy3d.cn', 'legacy'],
  ['remy3d.cn', 'legacy'],
  ['www.kiriengine.app', 'kiri'],
  ['kiriengine.app', 'kiri'],
  ['www.kiriengine.com', 'kiri'],
  ['kiriengine.com', 'kiri'],
  ['poly.cam', 'polycam'],
  ['www.poly.cam', 'polycam'],
  ['lumalabs.ai', 'luma'],
  ['www.lumalabs.ai', 'luma']
]);

const POLYCAM_PUBLIC_DATABASE = 'https://polycam-a4a1e.firebaseio.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Cache-Control': 'no-store'
};

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const shareUrlValue = requestUrl.searchParams.get('url');
  if (!shareUrlValue) return textResponse('Missing url parameter', 400);

  let shareUrl;
  try {
    shareUrl = new URL(shareUrlValue);
  } catch {
    return textResponse('Invalid share URL', 400);
  }

  const source = SHARE_SOURCES.get(shareUrl.hostname);
  if (shareUrl.protocol !== 'https:' || !source) {
    return textResponse('Share host is not allowed', 403);
  }

  try {
    let result;
    if (source === 'polycam') {
      result = await resolvePolycamShare(shareUrl);
    } else {
      const validPath = source === 'luma'
        ? shareUrl.pathname.startsWith('/capture/')
        : source === 'kiri'
          ? shareUrl.pathname.startsWith('/share/')
          : shareUrl.pathname.startsWith('/model/') || shareUrl.pathname.startsWith('/share/');
      if (!validPath) return textResponse('Unsupported share URL path', 403);

      const upstream = await fetch(shareUrl.toString(), {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Referer: source === 'kiri'
            ? 'https://www.kiriengine.app/'
            : source === 'luma'
              ? 'https://lumalabs.ai/'
              : 'https://www.remy3d.cn/',
          'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36'
        },
        redirect: 'follow'
      });

      if (!upstream.ok) {
        return textResponse(`Share page returned HTTP ${upstream.status}`, 502);
      }

      const html = await upstream.text();
      result = source === 'luma'
        ? parseLumaSharePage(html)
        : parseNuxtSharePage(html, source === 'kiri');
    }

    return jsonResponse(result);
  } catch (error) {
    return textResponse(`Unable to resolve share page: ${error.message}`, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function parseNuxtSharePage(html, isKiri) {
  const match = html.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Page does not contain Nuxt model data');

  const data = JSON.parse(match[1]);
  let plyUrl = null;
  let pcdUrl = null;
  let splatUrl = null;
  let camerasUrl = null;
  let unsupportedMeshUrl = null;

  for (const value of data) {
    if (typeof value !== 'string') continue;
    const normalized = value.replace(/\\u002F/g, '/');
    if (!normalized.startsWith('https://')) continue;
    if (normalized.includes('.splat')) splatUrl = normalized;
    if (normalized.includes('cameras.json')) camerasUrl = normalized;
    if (normalized.includes('.glb')) unsupportedMeshUrl = normalized;
    if (normalized.includes('.ply')) {
      if (normalized.includes('pcd.ply') || normalized.includes('/input/')) pcdUrl = normalized;
      else if (!plyUrl || normalized.includes('3DGS.ply') || normalized.includes('/output/')) plyUrl = normalized;
    }
  }

  if (!splatUrl && !plyUrl) {
    if (isKiri && unsupportedMeshUrl) throw new Error('This KIRI Engine share is a Mesh model, not 3DGS');
    throw new Error('No supported Splat or PLY asset found');
  }

  return {
    source: isKiri ? 'kiri' : 'legacy',
    name: findModelName(data, isKiri ? 'KIRI Engine Model' : '3D Model'),
    splatUrl,
    plyUrl,
    pcdUrl,
    camerasUrl
  };
}

export function parseLumaSharePage(html) {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Page does not contain Luma capture data');

  const data = JSON.parse(match[1]);
  const capture = data?.props?.pageProps?.capture;
  const artifacts = Array.isArray(capture?.artifacts) ? capture.artifacts : [];
  const gaussianPly = artifacts.find(artifact => artifact?.type === 'gaussian_splatting_point_cloud.ply');
  const pointCloud = artifacts.find(artifact => artifact?.type === 'point_cloud')
    || artifacts.find(artifact => artifact?.type === 'sfm_point_cloud');

  if (!gaussianPly?.url && !pointCloud?.url) {
    throw new Error('No supported PLY asset found in this Luma capture');
  }

  return {
    source: 'luma',
    name: capture?.title || data?.props?.pageProps?.captureMeta?.captureName || 'Luma Capture',
    plyUrl: gaussianPly?.url || pointCloud?.url || null,
    pcdUrl: gaussianPly?.url ? pointCloud?.url || null : null,
    splatUrl: null,
    camerasUrl: null
  };
}

export async function resolvePolycamShare(shareUrl) {
  const captureId = extractPolycamCaptureId(shareUrl.pathname);
  if (!captureId) throw new Error('Unsupported Polycam share URL path');

  const response = await fetch(`${POLYCAM_PUBLIC_DATABASE}/share/capture/${encodeURIComponent(captureId)}.json`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Polycam share data returned HTTP ${response.status}`);

  const capture = await response.json();
  if (!capture || typeof capture !== 'object') throw new Error('Polycam capture is unavailable or private');

  const plyUrl = capture.splatPly || buildPolycamArtifactUrl(captureId, 'splat.ply', capture.artifacts?.splatPly?.md5);
  const pcdUrl = capture.pointCloud || buildPolycamArtifactUrl(captureId, 'point_cloud.ply', capture.artifacts?.pointCloud?.md5);
  const splatUrl = !plyUrl ? capture.splat || capture.rawSplat || null : null;
  if (!plyUrl && !splatUrl && !pcdUrl) throw new Error('No supported PLY or Splat asset found in this Polycam capture');

  return {
    source: 'polycam',
    name: capture.name || 'Polycam Capture',
    plyUrl: plyUrl || null,
    pcdUrl: pcdUrl || null,
    splatUrl,
    camerasUrl: null,
    initialCameraTransform: capture.scene?.initialCameraTransform || null
  };
}

function extractPolycamCaptureId(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const captureIndex = segments.indexOf('capture');
  const captureId = captureIndex >= 0 ? segments[captureIndex + 1] : null;
  return captureId && /^[a-zA-Z0-9-]+$/.test(captureId) ? captureId : null;
}

function buildPolycamArtifactUrl(captureId, filename, md5) {
  if (!md5) return null;
  return `https://poly.cam/api/capture/${encodeURIComponent(captureId)}/artifacts/${filename}?md5=${encodeURIComponent(md5)}`;
}

function findModelName(data, fallback) {
  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== 'name') continue;
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = data[index + offset];
      if (typeof candidate === 'string' && candidate.length < 100 && !candidate.includes('http')) {
        return candidate;
      }
    }
  }
  return fallback;
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

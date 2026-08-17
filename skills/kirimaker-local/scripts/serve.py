#!/usr/bin/env python3
"""Serve the bundled KIRI Maker snapshot with its local resolver endpoint."""

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SOURCES = {
    "www.kiriengine.app": "kiri",
    "kiriengine.app": "kiri",
    "www.kiriengine.com": "kiri",
    "kiriengine.com": "kiri",
    "poly.cam": "polycam",
    "www.poly.cam": "polycam",
    "lumalabs.ai": "luma",
    "www.lumalabs.ai": "luma",
    "app.insta360.com": "insta360",
}
POLYCAM_PUBLIC_DATABASE = "https://polycam-a4a1e.firebaseio.com"


def parse_nuxt_share_page(html):
    match = re.search(r'id="__NUXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
    if not match:
        raise ValueError("Page does not contain Nuxt model data")
    data = json.loads(match.group(1))
    result = {"source": "kiri", "splatUrl": None, "plyUrl": None, "pcdUrl": None, "camerasUrl": None}
    unsupported_mesh = None
    for value in data:
        if not isinstance(value, str):
            continue
        value = value.replace(r"\u002F", "/")
        if not value.startswith("https://"):
            continue
        if ".splat" in value:
            result["splatUrl"] = value
        if "cameras.json" in value:
            result["camerasUrl"] = value
        if ".glb" in value:
            unsupported_mesh = value
        if ".ply" in value:
            if "pcd.ply" in value or "/input/" in value:
                result["pcdUrl"] = value
            elif not result["plyUrl"] or "3DGS.ply" in value or "/output/" in value:
                result["plyUrl"] = value
    if not result["splatUrl"] and not result["plyUrl"]:
        if unsupported_mesh:
            raise ValueError("This KIRI Engine share is a Mesh model, not 3DGS")
        raise ValueError("No supported Splat or PLY asset found")
    result["name"] = find_name(data, "KIRI Engine Model")
    return result


def parse_luma_share_page(html):
    match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
    if not match:
        raise ValueError("Page does not contain Luma capture data")
    page_props = json.loads(match.group(1)).get("props", {}).get("pageProps", {})
    capture = page_props.get("capture") or {}
    artifacts = capture.get("artifacts") or []
    gaussian = next((item for item in artifacts if item.get("type") == "gaussian_splatting_point_cloud.ply"), None)
    point_cloud = next((item for item in artifacts if item.get("type") == "point_cloud"), None)
    if point_cloud is None:
        point_cloud = next((item for item in artifacts if item.get("type") == "sfm_point_cloud"), None)
    if not gaussian and not point_cloud:
        raise ValueError("No supported PLY asset found in this Luma capture")
    return {
        "source": "luma",
        "name": capture.get("title") or page_props.get("captureMeta", {}).get("captureName") or "Luma Capture",
        "plyUrl": (gaussian or point_cloud).get("url"),
        "pcdUrl": point_cloud.get("url") if gaussian and point_cloud else None,
        "splatUrl": None,
        "camerasUrl": None,
    }


def parse_insta360_share_page(html):
    match = re.search(r'id=["\']__NEXT_DATA__["\'][^>]*>([\s\S]*?)</script>', html)
    if not match:
        raise ValueError("Page does not contain Insta360 model data")
    task_detail = (
        json.loads(match.group(1))
        .get("props", {})
        .get("pageProps", {})
        .get("taskDetail", {})
    )
    outputs = task_detail.get("outputs")
    if not isinstance(outputs, list):
        raise ValueError("Insta360 task does not contain model outputs")
    result = {
        "source": "insta360",
        "name": task_detail.get("title") or "Insta360 Model",
        "sogUrl": None,
        "splatUrl": None,
        "plyUrl": None,
        "pcdUrl": None,
        "camerasUrl": None,
    }
    for output in outputs:
        if not isinstance(output, dict):
            continue
        url = output.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        file_format = str(output.get("fileFormat") or "").lower()
        output_type = str(output.get("type") or "").lower()
        if output_type == "model" and file_format == "sog":
            result["sogUrl"] = url
        elif output_type == "model" and file_format == "splat":
            result["splatUrl"] = url
        elif output_type == "model" and file_format == "ply":
            result["plyUrl"] = url
        elif file_format == "json" and re.search(r'cameras\.json(?:\?|$)', url, re.IGNORECASE):
            result["camerasUrl"] = url
    if not result["sogUrl"] and not result["splatUrl"] and not result["plyUrl"]:
        raise ValueError("No supported SOG, Splat, or PLY asset found")
    return result


def resolve_polycam(parsed):
    segments = [segment for segment in parsed.path.split("/") if segment]
    if "capture" not in segments:
        raise ValueError("Unsupported Polycam share URL path")
    capture_index = segments.index("capture")
    if capture_index + 1 >= len(segments) or not re.fullmatch(r"[A-Za-z0-9-]+", segments[capture_index + 1]):
        raise ValueError("Unsupported Polycam share URL path")
    capture_id = segments[capture_index + 1]
    metadata_url = f"{POLYCAM_PUBLIC_DATABASE}/share/capture/{urllib.parse.quote(capture_id)}.json"
    with urllib.request.urlopen(metadata_url, timeout=30) as response:
        capture = json.loads(response.read().decode("utf-8"))
    if not isinstance(capture, dict):
        raise ValueError("Polycam capture is unavailable or private")
    artifacts = capture.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    splat_artifact = artifacts.get("splatPly")
    if not isinstance(splat_artifact, dict):
        splat_artifact = {}
    point_cloud_artifact = artifacts.get("pointCloud")
    if not isinstance(point_cloud_artifact, dict):
        point_cloud_artifact = {}
    ply_url = capture.get("splatPly") or build_polycam_artifact_url(
        capture_id, "splat.ply", splat_artifact.get("md5")
    )
    pcd_url = capture.get("pointCloud") or build_polycam_artifact_url(
        capture_id, "point_cloud.ply", point_cloud_artifact.get("md5")
    )
    splat_url = None if ply_url else capture.get("splat") or capture.get("rawSplat")
    if not ply_url and not pcd_url and not splat_url:
        raise ValueError("No supported PLY or Splat asset found in this Polycam capture")
    return {
        "source": "polycam",
        "name": capture.get("name") or "Polycam Capture",
        "plyUrl": ply_url,
        "pcdUrl": pcd_url,
        "splatUrl": splat_url,
        "camerasUrl": None,
        "initialCameraTransform": (capture.get("scene") or {}).get("initialCameraTransform"),
    }


def build_polycam_artifact_url(capture_id, filename, md5):
    if not md5:
        return None
    return "https://poly.cam/api/capture/{}/artifacts/{}?md5={}".format(
        urllib.parse.quote(capture_id, safe=""),
        urllib.parse.quote(filename, safe=""),
        urllib.parse.quote(str(md5), safe=""),
    )


def find_name(data, fallback):
    for index, value in enumerate(data):
        if value != "name":
            continue
        for candidate in data[index + 1:index + 5]:
            if isinstance(candidate, str) and len(candidate) < 100 and "http" not in candidate:
                return candidate
    return fallback


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
        self.end_headers()

    def do_GET(self):
        if urllib.parse.urlsplit(self.path).path == "/resolve":
            self.resolve_share()
            return
        super().do_GET()

    def resolve_share(self):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        target = query.get("url", [""])[0]
        if not target:
            self.send_text("Missing url parameter", 400)
            return
        try:
            parsed = urllib.parse.urlsplit(target)
            if not parsed.scheme or not parsed.hostname:
                self.send_text("Invalid share URL", 400)
                return
            source = SOURCES.get(parsed.hostname)
            if parsed.scheme != "https" or not source:
                self.send_text("Share host is not allowed", 403)
                return
            if source == "polycam":
                result = resolve_polycam(parsed)
            else:
                if source == "luma":
                    valid_path = parsed.path.startswith("/capture/")
                elif source == "insta360":
                    valid_path = parsed.path.startswith("/3dspace/detail/")
                else:
                    valid_path = parsed.path.startswith("/share/")
                if not valid_path:
                    self.send_text("Unsupported share URL path", 403)
                    return
                if source == "luma":
                    referer = "https://lumalabs.ai/"
                elif source == "insta360":
                    referer = "https://app.insta360.com/"
                else:
                    referer = "https://www.kiriengine.app/"
                upstream_query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
                upstream_query.append(("_kirimaker_refresh", str(int(time.time() * 1000))))
                upstream_url = urllib.parse.urlunsplit((
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    urllib.parse.urlencode(upstream_query),
                    parsed.fragment,
                ))
                request = urllib.request.Request(upstream_url, headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Cache-Control": "no-cache, no-store, max-age=0",
                    "Pragma": "no-cache",
                    "Referer": referer,
                    "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36",
                })
                with urllib.request.urlopen(request, timeout=30) as response:
                    html = response.read().decode("utf-8", errors="replace")
                if source == "luma":
                    result = parse_luma_share_page(html)
                elif source == "insta360":
                    result = parse_insta360_share_page(html)
                else:
                    result = parse_nuxt_share_page(html)
            body = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            self.send_text("Unable to resolve share page: {}".format(error), 502)

    def send_text(self, message, status):
        body = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Run KIRI Maker locally")
    parser.add_argument("--port", type=int, default=0, help="loopback port; 0 chooses a free port")
    args = parser.parse_args()

    skill_dir = Path(__file__).resolve().parent.parent
    site_dir = skill_dir / "assets"
    if not (site_dir / "index.html").is_file():
        parser.error("bundled KIRI Maker assets are incomplete: index.html is missing")
    os.chdir(str(site_dir))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("KIRI Maker: http://127.0.0.1:{}/".format(server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

# KIRI Maker

KIRI Maker is a responsive browser-based tool for exploring 3D Gaussian Splatting models, particle effects, and cinematic camera paths. It loads public KIRI Engine, Polycam, and Luma share links, switches between Particle Mode and original reconstructed scene, and exports camera-path videos from desktop and mobile layouts.

## Demo

https://kiri-maker.pages.dev/

For the best experience, use the latest version of Chrome, Edge, or Safari. Video export availability and the final MP4 or WebM format depend on the browser's MediaRecorder, WebCodecs, and codec support.

## Features

- Load public 3DGS models from KIRI Engine, Polycam, and Luma share links
- Click the dice button on the landing page to load one of four bundled KIRI Engine sample links at random
- Adjust particle size, brightness, density, opacity, softness, splat scale, and background cropping
- Apply 9 particle scatter and assembly effects
- Use 16 built-in cinematic camera-path presets
- Preview camera movement, particle assembly, and renderer transitions before export
- Switch rendering modes and play particle effects during preview or recording
- Export 1080p video at 60 FPS when supported by the browser
- Control supported interactions with MediaPipe hand gestures on desktop

## Model Loading

Paste a supported public share URL into the landing-page input and select **Load**. 

The dice button beside **Load** immediately selects and loads one of four built-in KIRI Engine examples. It is intended as a quick way to try KIRI Maker without finding a share link first.

### Supported Share Links

- [KIRI Engine](https://www.kiriengine.app/) 3DGS share links
- [Polycam](https://poly.cam/) Capture share links
- [Luma](https://lumalabs.ai/) Capture share links

## Camera Paths and Keyframes

KIRI Maker provides two camera-path workflows:

- **Built-in presets:** Choose one of 16 cinematic paths.
- **Custom paths:** Each keyframe stores the current camera position and target.

## Gesture Controls

Enable MediaPipe Gesture Recognizer on a supported desktop browser:

- 🤚 Open palm: increase particle dispersal
- 👊 Closed fist: gather particles
- ☝️ Pointing finger: control the model view
- 👊👊 Two fists moving closer or farther apart: scale the model
- ✌️ Victory gesture held for 0.7 seconds: switch between Particle Mode and 3D Reality

The recognition pipeline uses confidence thresholds, frame-history voting, stability checks, and hand-direction filtering to reduce accidental actions.

## Run Locally with the Skill

Send the following to the Agent you are using:
```
Please install the skill named "kirimaker-local" from https://github.com/willjim/KIRI-Maker locally.
```
Once the installation is complete, send "run KIRI Maker" to launch the local web interface.

## Deployment

The repository is configured for Cloudflare Pages:

- `wrangler.toml` publishes the repository root as the Pages output directory.
- `functions/resolve.js` handles supported share-link resolution.

No application build step or npm dependency installation is required for the static frontend.

## Project Structure

```text
KIRI-Maker/
├── index.html                         # Main application and inline Tabler SVG sprite
├── guide.html                         # Bilingual user guide (English by default)
├── css/
│   └── style.css                      # Desktop, tablet, and mobile interface styles
├── js/
│   ├── app.js                         # Application state, UI, loading, camera paths, and export
│   ├── gestureControl.js              # MediaPipe gesture recognition and stabilization
│   ├── kiriLoader.js                  # Share resolver client and model downloading
│   ├── landingBackground.js           # Animated landing-page background
│   ├── particleSystem.js              # Particle rendering and scatter effects
│   └── plyParser.js                   # PLY parsing and particle data preparation
├── functions/
│   └── resolve.js                     # Cloudflare Pages share-link resolver
├── skills/
│   └── kirimaker-local/
│       ├── SKILL.md                   # Local-launch workflow instructions
│       ├── agents/
│       │   └── openai.yaml            # Skill metadata
│       ├── scripts/
│       │   └── serve.py               # Loopback server and local resolver
│       └── assets/                    # Self-contained application bundle
├── .gitignore                         # Local cache, build, and backup exclusions
├── .pagesignore                       # Cloudflare Pages deployment exclusions
├── LICENSE                            # MIT License
├── README.md
└── wrangler.toml                      # Cloudflare Pages configuration
```

## Technology and Acknowledgements

KIRI Maker is built with and supported by the following projects:

- [Three.js](https://threejs.org/) — WebGL 3D rendering
- [Spark](https://sparkjs.dev/) — 3D Gaussian Splatting rendering
- [Tabler Icons](https://tabler.io/icons) — open-source interface icons
- [fflate](https://github.com/101arrowz/fflate) — in-browser ZIP extraction
- [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) — hand gesture recognition
- [GSAP](https://gsap.com/) — camera-path animation and UI timelines
- [fix-webm-duration](https://github.com/yusitnikov/fix-webm-duration) — WebM duration correction
- [Cloudflare Pages](https://pages.cloudflare.com/) — static hosting and resolver functions
- The [KIRI Engine](https://www.kiriengine.app/) team

## License

KIRI Maker is open-source software released under the [MIT License](LICENSE).

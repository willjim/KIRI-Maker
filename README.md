# KIRI Maker

KIRI Maker is a responsive 3D Gaussian Splatting effects and camera-path tool for desktop and mobile browsers. It loads public KIRI Engine, Polycam, Luma, and Insta360 share links, switches smoothly between Particle Mode and 3D Reality, and exports cinematic videos from built-in or custom camera paths.

For the best experience, use the latest version of Chrome, Edge, or Safari. Video export availability and output format depend on the browser's support for MediaRecorder, MP4, and WebM.

## Features

- Load public 3DGS models directly from KIRI Engine, Polycam, Luma, and Insta360 share links
- Download PLY, Splat, and Insta360 SOG assets automatically, and unpack compressed Luma PLY files locally in the browser
- Switch smoothly between Particle Mode and 3D Reality
- Pause or resume automatic model rotation while previewing and adjusting render modes
- Adjust particle size, brightness, density, opacity, softness, and independent Particle Mode background cropping
- Crop 3DGS content with editable ellipsoid or box volumes and direct X/Y/Z face handles
- Paint and confirm surface-aware Gaussian splat erasures, with brush sizing and undo support
- Apply 10 particle scatter and assembly effects, including the Interstellar Warp Meteor Assembly
- Use 19 built-in cinematic camera-path presets
- Record unlimited custom camera-path keyframes on desktop and mobile
- Restore any saved camera position and observation target by clicking its full viewpoint card
- Preview smooth, constant-speed custom paths using centripetal Catmull–Rom interpolation
- Preview camera movement, particle assembly, and renderer transitions before export
- Export 1080p video at 60 FPS when supported by the browser
- Use an English-first responsive interface for desktop, tablet, and mobile layouts
- Control supported interactions with MediaPipe hand gestures on desktop

## Gesture Controls

Enable MediaPipe Gesture Recognizer on a supported desktop browser:

- Open palm: increase particle dispersal
- Closed fist: gather particles
- Pointing finger: control the model view
- Two fists moving closer or farther apart: scale the model
- Victory gesture held for 0.7 seconds: switch between Particle Mode and 3D Reality

The recognition pipeline uses confidence thresholds, frame-history voting, stability checks, and hand-direction filtering to reduce accidental actions.

## Supported Share Links

- [KIRI Engine](https://www.kiriengine.app/) 3DGS share links
- [Polycam](https://poly.cam/) Capture share links
- [Luma](https://lumalabs.ai/) Capture share links
- [Insta360](https://app.insta360.com/3dspace) 3D Space share links (SOG)

## Run Locally with the Bundled Skill

The `skills/kirimaker-local` directory contains a self-contained local launcher that does not require npm installation. After installing the skill, ask your agent to “run KIRI Maker locally” to receive a clickable loopback URL.

The browser still needs internet access for external rendering libraries and public model assets.

## Project Structure

```text
project-root/
├── index.html
├── guide.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── gestureControl.js
│   ├── kiriLoader.js
│   ├── landingBackground.js
│   ├── particleSystem.js
│   └── plyParser.js
├── functions/
│   └── resolve.js
├── skills/
│   └── kirimaker-local/
├── .pagesignore
├── LICENSE
├── README.md
└── wrangler.toml
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

KIRI Maker is released under the [MIT License](LICENSE).

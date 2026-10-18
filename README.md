# My-Movie-House 🎬🥽✨

A premium, high-performance Movie & TV Series Streaming Web Application featuring an **Apple VisionOS Spatial UI**, an **Auto-Sliding Hero Carousel** with trending movies & series, full English interface, and seamless integration with Stremio-compatible streaming addons.

> **Designed & Developed by Sakibur Rahman**

---

## 🌟 Key Features

- **🥽 Apple VisionOS Spatial UI**:
  - Immersive 3D architectural room environment backdrop (slatted wood ceiling with recessed spotlights, acoustic wall panels, perspective warm wood floor, ambient reflection glow).
  - Floating frosted spatial window shell with squircle curves, specular rim lighting, and a VisionOS grab handle bar.
  - Floating top status pill with live digital clock, spatial status indicators, and creator signature.
  - Dark-tinted frosted glass cards (`.spatial-card`), royal blue buttons (`#2563eb`), and crisp white typography.
- **🎞️ Hero Section Auto-Slider**:
  - Seamless auto-rotating carousel featuring top trending movies and series.
  - Compact, stylish title design tailored for optimal visual hierarchy.
  - Pause-on-hover capability for comfortable reading and clicking.
  - Full manual navigation with previous (`‹`) & next (`›`) controls and direct slide indicator dots.
  - Badges for trending rank, content type, release year, IMDb rating, and curation credits.
- **🌐 100% English Interface**: All UI copy, navigation, error dialogues, and backend messages in clean international English.
- **⚡ 1-Click Batch Launchers**:
  - Launch both Backend and Frontend in a single click with `Start-My-Movie-House.bat` or `movie-site\start.bat`.
- **🎥 Adaptive Video Player**: High-definition video player powered by HLS.js with progress auto-save and continue-watching support.
- **🔌 Stremio Addon Compatibility**: Extensible backend supporting community and official Stremio catalog and stream manifests.
- **📱 Fully Responsive**: Fluid experience across mobile, tablet, and desktop screens.

---

## 🚀 1-Click Start (Windows)

Simply double-click:
```bat
Start-My-Movie-House.bat
```
*(or run `start.bat` located inside the `movie-site` folder)*

This automatically starts both the backend API and frontend dev server and launches your browser at `http://localhost:5173`.

---

## 🛠️ Manual Start Guide

### 1. Backend Server (Port 3001)
```bash
cd backend
npm install
npm start
```

### 2. Frontend Application (Port 5173)
```bash
cd My-Movie-House-frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📁 Project Architecture

```
movie-site/
├── backend/
│   ├── addon-manager.js    # Stremio addon resolver & manifest manager
│   ├── server.js           # Express API server (port 3001)
│   └── package.json        # Backend dependencies
├── My-Movie-House-frontend/
│   ├── src/
│   │   ├── components/     # Navbar, Footer, MovieCard, ContentRow, StreamModal, VideoPlayer
│   │   ├── pages/          # Home, Detail, Search, Settings
│   │   ├── styles/         # Spatial UI system & animations (index.css)
│   │   ├── api.js          # Backend API & localStorage progress manager
│   │   ├── App.jsx         # VisionOS Spatial Window shell & layout
│   │   └── main.jsx        # Entry point
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
├── start.bat               # 1-Click launcher
└── README.md
```

---

## 👤 Author & Credits

- **Creator & Developer**: Sakibur Rahman
- **Project**: My-Movie-House
- **UI Theme**: Apple VisionOS Spatial Computing

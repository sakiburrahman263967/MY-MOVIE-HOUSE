import { lazy, Suspense, useState, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';

const Search   = lazy(() => import('./pages/Search.jsx'));
const Detail   = lazy(() => import('./pages/Detail.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const LiveTv   = lazy(() => import('./pages/LiveTv.jsx'));

/* ─── Full-Screen Splash Loader ─── */
function SplashScreen({ visible }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #070b14 0%, #0b1020 60%, #080d18 100%)',
        transition: 'opacity 0.5s ease, visibility 0.5s ease',
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      {/* Logo / Brand */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: '-0.5px',
          color: '#fff',
          lineHeight: 1.1,
        }}>
          My-Movie-House
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          by Sakibur Rahman
        </div>
      </div>

      {/* Spinner Ring */}
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        {/* Outer glow ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '2px solid rgba(59,130,246,0.15)',
        }} />
        {/* Spinning arc */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#3b82f6',
          borderRightColor: 'rgba(59,130,246,0.4)',
          animation: 'mmh-spin 0.8s linear infinite',
        }} />
        {/* Inner dot */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#3b82f6',
          boxShadow: '0 0 10px 2px rgba(59,130,246,0.6)',
        }} />
      </div>

      {/* Loading text */}
      <div style={{
        marginTop: 20,
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.08em',
      }}>
        Loading…
      </div>

      {/* Keyframe style */}
      <style>{`
        @keyframes mmh-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    // Hide splash after a minimum display time + React paint
    // requestAnimationFrame ensures one paint cycle completes first
    const timer = setTimeout(() => {
      requestAnimationFrame(() => setSplashVisible(false));
    }, 900); // 0.9s minimum splash — feels snappy but not rushed
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <SplashScreen visible={splashVisible} />

      <div className="relative min-h-screen text-white select-none selection:bg-blue-500/30">
        {/* Simple flat dark background */}
        <div className="spatial-room" aria-hidden="true" />

        <div className="relative z-10 flex min-h-screen flex-col items-center justify-between p-2 sm:p-4 md:p-5 lg:p-6">
          {/* Main Floating VisionOS Spatial Window */}
          <div className="spatial-window flex w-full max-w-[1540px] flex-1 flex-col overflow-hidden">
            <Navbar />

            <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8">
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              }>
                <Routes>
                  <Route path="/"                 element={<Home />} />
                  <Route path="/search"           element={<Search />} />
                  <Route path="/detail/:type/:id" element={<Detail />} />
                  <Route path="/settings"         element={<Settings />} />
                  <Route path="/iptv"             element={<LiveTv />} />
                  <Route path="/livetv"           element={<LiveTv />} />
                </Routes>
              </Suspense>
            </main>

            <Footer />
            <div className="spatial-grab-handle" />
          </div>
        </div>
      </div>
    </>
  );
}

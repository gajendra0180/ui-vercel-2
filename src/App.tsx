import { ThirdwebProvider, ConnectButton } from "thirdweb/react";
import { baseSepolia } from "thirdweb/chains";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Suspense, lazy, useState } from "react";
import { Spinner } from "./components/Spinner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./App.css";
import { thirdwebClient, THIRDWEB_CLIENT_ID } from "./lib/thirdwebClient";

// Route-based code splitting - lazy load all pages to reduce initial bundle
// This reduces initial bundle from 2MB to ~300KB
const OverviewPage = lazy(() => import("./pages/OverviewPage").then(m => ({ default: m.OverviewPage })));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage").then(m => ({ default: m.MarketplacePage })));
const APIDetailsPage = lazy(() => import("./pages/APIDetailsPage").then(m => ({ default: m.APIDetailsPage })));
const SubmitAPIForm = lazy(() => import("./pages/SubmitAPIForm").then(m => ({ default: m.SubmitAPIForm })));
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const AgentComposerPage = lazy(() => import("./pages/AgentComposerPage").then(m => ({ default: m.AgentComposerPage })));
const ChatPage = lazy(() => import("./pages/ChatPage").then(m => ({ default: m.ChatPage })));
const AgentMarketplace = lazy(() => import("./pages/AgentMarketplace").then(m => ({ default: m.AgentMarketplace })));
const AgentDetailsPage = lazy(() => import("./pages/AgentDetailsPage").then(m => ({ default: m.AgentDetailsPage })));

/**
 * Loading fallback component shown while route chunks are being loaded
 */
function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '400px',
      width: '100%'
    }}>
      <Spinner size="large" label="Loading page..." />
    </div>
  );
}

function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Close mobile menu when route changes
  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <Link to="/" onClick={handleNavClick}>🚀 IAO Launchpad</Link>
      </div>

      {/* Mobile hamburger button */}
      <button
        className="hamburger-menu"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={mobileMenuOpen}
        aria-controls="nav-links"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={`nav-links ${mobileMenuOpen ? "mobile-open" : ""}`} id="nav-links">
        <Link to="/" className={isActive("/") ? "active" : ""} onClick={handleNavClick}>
          📊 Overview
        </Link>
        <Link to="/marketplace" className={isActive("/marketplace") ? "active" : ""} onClick={handleNavClick}>
          🛍️ Marketplace
        </Link>
        <Link to="/chat" className={isActive("/chat") ? "active" : ""} onClick={handleNavClick}>
          💬 Chat
        </Link>
        <Link to="/agent-marketplace" className={isActive("/agent-marketplace") ? "active" : ""} onClick={handleNavClick}>
          🎯 Agent Marketplace
        </Link>
        <Link to="/agents" className={isActive("/agents") ? "active" : ""} onClick={handleNavClick}>
          🤖 Agents
        </Link>
        <Link to="/submit" className={isActive("/submit") ? "active" : ""} onClick={handleNavClick}>
          🖥️ Register Server
        </Link>
        <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""} onClick={handleNavClick}>
          👤 Dashboard
        </Link>
      </div>
      <div className="nav-wallet">
        <ConnectButton client={thirdwebClient} chain={baseSepolia} />
      </div>
    </nav>
  );
}

function AppContent() {
  return (
    <div className="container">
      <header className="header">
        <Navigation />
      </header>

      <main className="main-content">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/server/:serverSlug" element={<APIDetailsPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/agent-marketplace" element={<AgentMarketplace />} />
            <Route path="/agent/:agentId" element={<AgentDetailsPage />} />
            <Route path="/agents" element={<AgentComposerPage />} />
            <Route path="/submit" element={<SubmitAPIForm />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="footer"></footer>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      {/* @ts-ignore - ThirdwebProvider type definitions may be outdated */}
      <ThirdwebProvider clientId={THIRDWEB_CLIENT_ID}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ThirdwebProvider>
    </ErrorBoundary>
  );
}

export default App;

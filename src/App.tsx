import { ThirdwebProvider, ConnectButton } from "thirdweb/react";
import { baseSepolia } from "thirdweb/chains";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Suspense, lazy, useState, useEffect } from "react";
import { Spinner } from "./components/Spinner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";
import { ChainProvider, useChainContext } from "./contexts/ChainContext";
import { ChainSelector } from "./components/ChainSelector";
import { useX402Payment } from "./hooks/useX402Payment";
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
const NewChatPlayground = lazy(() => import("./pages/NewChatPlayground").then(m => ({ default: m.NewChatPlayground })));

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
  const { selectedChainId, setSelectedChain, getChainConfig } = useChainContext();
  const { connectSolanaWallet, getSolanaAddress, isSolanaWalletAvailable } = useX402Payment();
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [isConnectingSolana, setIsConnectingSolana] = useState(false);

  // Get current chain type
  const currentChainConfig = selectedChainId ? getChainConfig(selectedChainId) : null;
  const isSolanaChain = currentChainConfig?.chainType === 'solana';

  const isActive = (path: string) => location.pathname === path;

  // Close mobile menu when route changes
  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  // Update Solana address when chain changes or wallet connects
  useEffect(() => {
    if (isSolanaChain) {
      const address = getSolanaAddress();
      setSolanaAddress(address);

      // Listen for Solana wallet connection changes
      const solana = (window as any).solana || (window as any).phantom?.solana;
      if (solana) {
        const handleConnect = () => {
          const addr = getSolanaAddress();
          setSolanaAddress(addr);
        };
        const handleDisconnect = () => {
          setSolanaAddress(null);
        };

        solana.on?.("connect", handleConnect);
        solana.on?.("disconnect", handleDisconnect);

        return () => {
          solana.off?.("connect", handleConnect);
          solana.off?.("disconnect", handleDisconnect);
        };
      }
    }
  }, [isSolanaChain, getSolanaAddress]);

  // Handle Solana wallet connection
  const handleConnectSolana = async () => {
    setIsConnectingSolana(true);
    try {
      const address = await connectSolanaWallet();
      setSolanaAddress(address);
    } catch (error: any) {
      console.error("Failed to connect Solana wallet:", error);
      alert(error.message || "Failed to connect Solana wallet");
    } finally {
      setIsConnectingSolana(false);
    }
  };

  // Format Solana address for display
  const formatSolanaAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <Link to="/" onClick={handleNavClick}>🚀 APIX</Link>
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
          Overview
        </Link>
        <Link to="/marketplace" className={isActive("/marketplace") ? "active" : ""} onClick={handleNavClick}>
          APIs
        </Link>
        <Link to="/agent-marketplace" className={isActive("/agent-marketplace") || isActive("/chat") || isActive("/new-chat") ? "active" : ""} onClick={handleNavClick}>
          Agents
        </Link>
        <Link to="/submit" className={isActive("/submit") || isActive("/agents") ? "active" : ""} onClick={handleNavClick}>
          Build
        </Link>
        <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""} onClick={handleNavClick}>
          Dashboard
        </Link>

        {/* Chain selector for mobile - pills variant */}
        <div className="nav-chain-selector-mobile">
          <ChainSelector
            selectedChainId={selectedChainId}
            onSelectChain={setSelectedChain}
            variant="pills"
            showAllOption={false}
          />
        </div>
      </div>

      {/* Chain selector for desktop - dropdown variant */}
      <div className="nav-chain-selector">
        <ChainSelector
          selectedChainId={selectedChainId}
          onSelectChain={setSelectedChain}
          variant="dropdown"
          showAllOption={false}
        />
      </div>

      {/* Wallet connection - conditional based on chain type */}
      <div className="nav-wallet">
        {isSolanaChain ? (
          // Solana wallet button
          solanaAddress ? (
            <div className="solana-wallet-display">
              <span className="wallet-label">Phantom</span>
              <span className="wallet-address">{formatSolanaAddress(solanaAddress)}</span>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleConnectSolana}
              disabled={isConnectingSolana || !isSolanaWalletAvailable()}
            >
              {isConnectingSolana ? "Connecting..." : "Connect Phantom"}
            </button>
          )
        ) : (
          // EVM wallet button (thirdweb)
          <ConnectButton client={thirdwebClient} chain={baseSepolia} />
        )}
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
            <Route path="/new-chat" element={<NewChatPlayground />} />
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
          <ToastProvider>
            <ChainProvider>
              <AppContent />
            </ChainProvider>
          </ToastProvider>
        </BrowserRouter>
      </ThirdwebProvider>
    </ErrorBoundary>
  );
}

export default App;

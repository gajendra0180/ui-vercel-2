import { ThirdwebProvider, ConnectButton } from "thirdweb/react";
import { baseSepolia } from "thirdweb/chains";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { DiscoverPage } from "./pages/DiscoverPage";
import { APIDetailsPage } from "./pages/APIDetailsPage";
import { SubmitAPIForm } from "./pages/SubmitAPIForm";
import { Dashboard } from "./pages/Dashboard";
import "./App.css";
import { thirdwebClient, THIRDWEB_CLIENT_ID } from "./lib/thirdwebClient";

function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <Link to="/">🚀 IAO Launchpad</Link>
      </div>
      <div className="nav-links">
        <Link to="/" className={isActive("/") ? "active" : ""}>
          🏠 Discover
        </Link>
        <Link to="/submit" className={isActive("/submit") ? "active" : ""}>
          ➕ Submit API
        </Link>
        <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""}>
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
        <Routes>
          <Route path="/" element={<DiscoverPage />} />
          <Route path="/api/:address" element={<APIDetailsPage />} />
          <Route path="/submit" element={<SubmitAPIForm />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>
          Powered by{" "}
          <a href="https://cdp.coinbase.com" target="_blank" rel="noopener noreferrer">
            Coinbase CDP
          </a>{" "}
          &{" "}
          <a href="https://x402.org" target="_blank" rel="noopener noreferrer">
            x402 Protocol
          </a>
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    // @ts-ignore - ThirdwebProvider type definitions may be outdated
    <ThirdwebProvider clientId={THIRDWEB_CLIENT_ID}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThirdwebProvider>
  );
}

export default App;

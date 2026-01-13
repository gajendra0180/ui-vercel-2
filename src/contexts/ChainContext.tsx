import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChainConfig, getChains } from '../utils/api';

const STORAGE_KEY = 'apix_selected_chain';

interface ChainContextType {
  selectedChainId: string | null;
  chains: ChainConfig[];
  loading: boolean;
  error: string | null;
  setSelectedChain: (chainId: string | null) => void;
  getChainConfig: (chainId: string) => ChainConfig | undefined;
  isChainSelected: (chainId: string) => boolean;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export const ChainProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedChainId, setSelectedChainIdState] = useState<string | null>(null);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load chains from API on mount
  useEffect(() => {
    const loadChains = async () => {
      try {
        setLoading(true);
        setError(null);
        const availableChains = await getChains();
        setChains(availableChains);

        // Load saved chain from localStorage
        const savedChainId = localStorage.getItem(STORAGE_KEY);

        // Validate saved chain exists in available chains
        if (savedChainId && availableChains.some(c => c.chainId === savedChainId)) {
          setSelectedChainIdState(savedChainId);
        } else if (availableChains.length > 0) {
          // Default to first available chain (Base Sepolia)
          setSelectedChainIdState(availableChains[0].chainId);
        }
      } catch (err) {
        console.error('Failed to load chains:', err);
        setError('Failed to load blockchain networks');
        // Set default chain on error
        setSelectedChainIdState('84532'); // Base Sepolia
      } finally {
        setLoading(false);
      }
    };

    loadChains();
  }, []);

  // Persist chain selection to localStorage
  const setSelectedChain = (chainId: string | null) => {
    setSelectedChainIdState(chainId);

    try {
      if (chainId) {
        localStorage.setItem(STORAGE_KEY, chainId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to save chain selection to localStorage:', err);
      // Continue anyway - graceful degradation
    }
  };

  // Get chain config by chainId
  const getChainConfig = (chainId: string): ChainConfig | undefined => {
    return chains.find(c => c.chainId === chainId);
  };

  // Check if a specific chain is selected
  const isChainSelected = (chainId: string): boolean => {
    return selectedChainId === chainId;
  };

  const value: ChainContextType = {
    selectedChainId,
    chains,
    loading,
    error,
    setSelectedChain,
    getChainConfig,
    isChainSelected,
  };

  return (
    <ChainContext.Provider value={value}>
      {children}
    </ChainContext.Provider>
  );
};

export const useChainContext = () => {
  const context = useContext(ChainContext);
  if (!context) {
    throw new Error('useChainContext must be used within a ChainProvider');
  }
  return context;
};

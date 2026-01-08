import { useState, useEffect, useCallback } from 'react';

interface UseFavoritesReturn {
  favorites: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  addFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;
}

export const useFavorites = (walletAddress?: string): UseFavoritesReturn => {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Storage key based on wallet address
  const storageKey = walletAddress
    ? `favorites_${walletAddress.toLowerCase()}`
    : 'favorites_guest';

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites(new Set(parsed));
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }, [storageKey]);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(favorites)));
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }, [favorites, storageKey]);

  // Listen for storage changes (sync across tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setFavorites(new Set(parsed));
        } catch (error) {
          console.error('Failed to sync favorites:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  const isFavorite = useCallback(
    (id: string) => favorites.has(id),
    [favorites]
  );

  const addFavorite = useCallback((id: string) => {
    setFavorites((prev) => new Set(prev).add(id));
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      if (favorites.has(id)) {
        removeFavorite(id);
      } else {
        addFavorite(id);
      }
    },
    [favorites, addFavorite, removeFavorite]
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
  };
};

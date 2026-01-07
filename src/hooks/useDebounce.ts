import { useState, useEffect } from "react";

/**
 * Hook to debounce a value
 * Useful for search inputs to avoid excessive filtering/API calls
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before the delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

import React, { useState } from "react";
import "./Tooltip.css";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

/**
 * Tooltip component - displays helpful information on hover
 * Accessibility: Screen-reader friendly with aria-label and focus support
 */
export function Tooltip({
  children,
  content,
  position = "top",
  delay = 0
}: TooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  let timeoutId: NodeJS.Timeout | null = null;

  const handleMouseEnter = () => {
    if (delay > 0) {
      timeoutId = setTimeout(() => {
        setShowTooltip(true);
      }, delay);
    } else {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setShowTooltip(false);
  };

  const handleFocus = () => {
    setShowTooltip(true);
  };

  const handleBlur = () => {
    setShowTooltip(false);
  };

  return (
    <div className="tooltip-wrapper">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        tabIndex={0}
        aria-label={content}
        className="tooltip-trigger"
      >
        {children}
        {showTooltip && (
          <div className={`tooltip-content tooltip-${position}`} role="tooltip">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

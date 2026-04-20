"use client";

import React, { useState, useRef, useEffect } from "react";
import s from "../styles/egin-map.module.css";

/** Single tool definition passed in from the parent */
export interface ToolDef {
  id: string;
  label: string;
  /** Inline SVG JSX or icon component */
  icon: React.ReactNode;
  onClick: () => void;
  /** Mark as active (highlighted green) */
  active?: boolean;
  /** Mark as danger (red, e.g. delete) */
  danger?: boolean;
  /** Insert a divider before this tool */
  divider?: boolean;
}

interface EginToolbarProps {
  tools: ToolDef[];
  /** Show on desktop (vertical strip, left side) */
  className?: string;
}

/**
 * Desktop vertical glassmorphism toolbar.
 * Renders inside the map wrapper – all positioning is via CSS Modules.
 * Each button shows a tooltip on hover via `data-tooltip` (when collapsed).
 * On hover/click, expands to show tool labels.
 */
const EginToolbar: React.FC<EginToolbarProps> = ({ tools }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={toolbarRef}
      className={`${s.toolbar} ${isExpanded ? s.toolbarExpanded : ""}`}
      onPointerEnter={(e: React.PointerEvent) => { if (e.pointerType === "mouse") setIsExpanded(true); }}
      onPointerLeave={(e: React.PointerEvent) => { if (e.pointerType === "mouse") setIsExpanded(false); }}
      onClick={() => { if (!isExpanded) setIsExpanded(true); }}
    >
      {tools.map((tool) => (
        <React.Fragment key={tool.id}>
          {tool.divider && <div className={s.toolDivider} />}
          <button
            type="button"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              tool.onClick();
              setIsExpanded(false);
            }}
            className={
              tool.danger
                ? s.toolBtnDanger
                : tool.active
                  ? s.toolBtnActive
                  : s.toolBtn
            }
            data-tooltip={tool.label}
            aria-label={tool.label}
          >
            <div className={s.toolIconWrapper}>{tool.icon}</div>
            <span className={s.toolLabel}>{tool.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default EginToolbar;

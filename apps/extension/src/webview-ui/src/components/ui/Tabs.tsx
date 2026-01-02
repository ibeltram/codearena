import React, { createContext, useContext, useState, useCallback, useRef, KeyboardEvent } from 'react';
import './Tabs.css';

// ============================================
// Tabs Context
// ============================================

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs container');
  }
  return context;
}

// ============================================
// Tabs Container
// ============================================

export interface TabsProps {
  /** Current active tab value */
  value?: string;
  /** Callback when tab changes */
  onValueChange?: (value: string) => void;
  /** Default tab value (for uncontrolled mode) */
  defaultValue?: string;
  /** Additional CSS class names */
  className?: string;
  /** Tab components */
  children: React.ReactNode;
}

/**
 * Tabs - Container component for tab navigation
 *
 * Can be controlled (value + onValueChange) or uncontrolled (defaultValue).
 */
export function Tabs({
  value,
  onValueChange,
  defaultValue = '',
  className = '',
  children,
}: TabsProps) {
  // Uncontrolled state
  const [internalValue, setInternalValue] = useState(defaultValue);

  // Determine if controlled
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleValueChange = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={`tabs ${className}`.trim()}>{children}</div>
    </TabsContext.Provider>
  );
}

// ============================================
// TabList
// ============================================

export interface TabListProps {
  /** Additional CSS class names */
  className?: string;
  /** Tab triggers */
  children: React.ReactNode;
}

/**
 * TabList - Horizontal container for tab triggers
 */
export function TabList({ className = '', children }: TabListProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    const tabs = Array.from(tabList.querySelectorAll('[role="tab"]')) as HTMLElement[];
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);

    let newIndex: number | null = null;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== null && tabs[newIndex]) {
      tabs[newIndex].focus();
    }
  }, []);

  return (
    <div
      ref={tabListRef}
      className={`tabs__list ${className}`.trim()}
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

// ============================================
// TabTrigger
// ============================================

export interface TabTriggerProps {
  /** Value that identifies this tab */
  value: string;
  /** Additional CSS class names */
  className?: string;
  /** Disable this tab */
  disabled?: boolean;
  /** Tab label */
  children: React.ReactNode;
}

/**
 * TabTrigger - Individual tab button
 */
export function TabTrigger({
  value: tabValue,
  className = '',
  disabled = false,
  children,
}: TabTriggerProps) {
  const { value, onValueChange } = useTabsContext();
  const isSelected = value === tabValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      aria-controls={`tabpanel-${tabValue}`}
      id={`tab-${tabValue}`}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      className={`tabs__trigger ${isSelected ? 'tabs__trigger--active' : ''} ${
        disabled ? 'tabs__trigger--disabled' : ''
      } ${className}`.trim()}
      onClick={() => !disabled && onValueChange(tabValue)}
    >
      {children}
    </button>
  );
}

// ============================================
// TabContent
// ============================================

export interface TabContentProps {
  /** Value that identifies this tab panel */
  value: string;
  /** Additional CSS class names */
  className?: string;
  /** Panel content */
  children: React.ReactNode;
}

/**
 * TabContent - Panel content for a tab
 *
 * Only renders when its tab is active.
 */
export function TabContent({ value: tabValue, className = '', children }: TabContentProps) {
  const { value } = useTabsContext();
  const isSelected = value === tabValue;

  if (!isSelected) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabValue}`}
      aria-labelledby={`tab-${tabValue}`}
      className={`tabs__content ${className}`.trim()}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export default Tabs;

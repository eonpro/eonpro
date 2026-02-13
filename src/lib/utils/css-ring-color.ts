import type React from 'react';

/**
 * Style object for Tailwind ring color custom property.
 * Use instead of `style={{ '--tw-ring-color': color } as any}`.
 */
export function ringColorStyle(color: string): React.CSSProperties {
  return { '--tw-ring-color': color } as React.CSSProperties;
}

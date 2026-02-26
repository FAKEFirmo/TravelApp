import type { CSSProperties, ReactNode } from 'react';

/**
 * A small utility wrapper for the "liquid glass" look (blur + translucent fill).
 *
 * Note: for mobile WebView support, you may need to enable hardware acceleration.
 */
export function GlassSurface(props: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { children, className, style } = props;

  return (
    <div
      className={['glassSurface', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

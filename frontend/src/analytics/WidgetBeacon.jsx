import React, { useEffect, useRef } from 'react';
import { isTrackedWidget, trackWidgetImpression, trackWidgetInteraction } from './index.js';

const CONTROLS = 'a[href], button, [role="button"], [role="tab"], [role="checkbox"], input, select, textarea, .MuiChip-clickable';

/**
 * Put inside a dashboard widget's container: it measures that container without changing its layout.
 *  - impression: at least half of the widget was on screen for one second (once per page view);
 *  - interaction: a click on a link or a control inside it. Only "a link" or "a control" is recorded, never
 *    which one, its text or where it leads.
 * Keys outside the catalogue (Studio content cards, skeletons) are ignored.
 */
export function WidgetBeacon({ widgetKey }) {
  const marker = useRef(null);
  useEffect(() => {
    const element = marker.current?.parentElement;
    if (!element || !isTrackedWidget(widgetKey) || !window.IntersectionObserver) return undefined;
    let timer = null;
    const observer = new window.IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        timer ??= setTimeout(() => { timer = null; trackWidgetImpression(widgetKey); }, 1000);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }, { threshold: [0, 0.5, 1] });
    observer.observe(element);
    const onClick = (event) => {
      const control = typeof event.target?.closest === 'function' ? event.target.closest(CONTROLS) : null;
      if (!control || !element.contains(control) || control.closest('.drag-grip')) return;
      trackWidgetInteraction(widgetKey, control.matches('a[href]') ? 'LINK' : 'CONTROL');
    };
    element.addEventListener('click', onClick, { capture: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      element.removeEventListener('click', onClick, { capture: true });
    };
  }, [widgetKey]);
  return <span ref={marker} hidden aria-hidden="true" />;
}

export default WidgetBeacon;

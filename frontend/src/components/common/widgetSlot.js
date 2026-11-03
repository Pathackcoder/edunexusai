import { createContext, useContext } from 'react';

/**
 * Set by the dashboard grid for each widget slot: the widget's standard size and whether
 * its height is currently fixed (tablet and up). Cards use it to keep a one-row header
 * and to fit their lists; outside a dashboard grid it is empty and nothing changes.
 */
// `presentation` ({ title, subtitle } or null) is an optional override from a published CMS
// dashboard layout; the outermost WidgetCard in the slot applies it.
export const WidgetSlotContext = createContext({ size: null, fixed: false, presentation: null });
export const useWidgetSlot = () => useContext(WidgetSlotContext);

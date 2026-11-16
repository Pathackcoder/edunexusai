/**
 * Loads every Nexora tool into the registry. Persona files only declare tools; the registry decides per session
 * which of them a person may use.
 */
import './sharedTools.js';
import './studentTools.js';
import './facultyTools.js';
import './adminTools.js';

export { allTools, denialReason, getTool, toolsFor } from './registry.js';

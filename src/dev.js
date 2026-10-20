// Development only. `npm run push` leaves this file out (.claspignore), so a release build has no mock mode and
// never shows the Mock API badge. `npm run push:dev` sends it along, for a test document.
//
// Mock mode: the sidebar answers with canned API runs and sends nothing to p3n. Run these from the Apps Script
// editor (they change only your own properties), then reopen the sidebar.

const PROP_MOCK = 'p3n.mock';

function devMockOn() { PropertiesService.getUserProperties().setProperty(PROP_MOCK, '1'); }
function devMockOff() { PropertiesService.getUserProperties().deleteProperty(PROP_MOCK); }
function devMock_() { return PropertiesService.getUserProperties().getProperty(PROP_MOCK) === '1'; }

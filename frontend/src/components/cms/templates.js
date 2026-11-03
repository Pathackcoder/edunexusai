/**
 * Starting layouts for "Add page". Each produces ordinary page-builder data (validated by
 * the server like any other layout); after creation everything is editable.
 */
let seq = 0;
const id = (type) => `${type}-${Date.now().toString(36)}-${(seq += 1)}`;
const b = (type, props = {}) => ({ type, props: { id: id(type), ...props } });
const cols = (layout, column1 = [], column2 = [], column3 = []) => b('Columns', { layout, gap: 'md', verticalAlign: 'start', stackOn: 'mobile', column1, column2, column3 });
const page = (content, width = 'normal') => ({ root: { props: { width } }, content });

/**
 * `icon` names an icon in the Add page dialog; `kind` is 'template' (pre-built content) or
 * 'blank' (an empty column layout). Keys are stored on the page (`template`), so existing
 * keys keep their meaning; only labels have been made friendlier.
 */
export const TEMPLATES = [
  {
    key: 'hub', kind: 'template', icon: 'dashboard', label: 'Dashboard', description: 'A banner, quick-link cards and live campus news.',
    build: () => page([b('Banner', { eyebrow: 'Campus', title: 'Welcome to the hub', description: 'Everything you need in one place.', tone: 'brand' }), cols('1-1-1', [b('InfoCard', { title: 'Academics', icon: 'school', body: 'Classes, grades and planning.', linkLabel: 'Open', linkUrl: '/academics' })], [b('InfoCard', { title: 'Campus life', icon: 'people', body: 'Groups, events and services.', linkLabel: 'Open', linkUrl: '/campus' })], [b('InfoCard', { title: 'Help', icon: 'support', body: 'FAQs and the help desk.', linkLabel: 'Open', linkUrl: '/help' })]), b('AnnouncementsFeed', { title: 'Latest news', limit: 3 })], 'wide'),
  },
  {
    key: 'link', kind: 'template', icon: 'link', label: 'Link page', description: 'Introduces another site or service and links to it.',
    build: () => page([b('Heading', { text: 'Service name', level: 'h1', subtitle: 'One sentence on what people will find there.' }), b('RichText', { markdown: 'Explain who the service is for and what to have ready before opening it.' }), b('ButtonLink', { label: 'Open the service', url: 'https://www.example.edu', variant: 'contained' })], 'narrow'),
  },
  {
    key: 'office', kind: 'template', icon: 'about', label: 'About us', description: 'Banner, description, locations and contact details.',
    build: () => page([b('Banner', { title: 'Office name', description: 'What the office does and who it serves.', tone: 'dark' }), cols('2-1', [b('Heading', { text: 'Locations', level: 'h2' }), b('RichText', { markdown: '**First-year centre** — Learning Commons, Suite 103\n\n**Success centre** — Learning Commons, behind the café' })], [b('ContactCard', { name: 'Office name', role: 'Monday–Friday 8:30–4:30', email: 'office@feddrick.edu', phone: '617 333 2194', location: 'Learning Commons' })]), b('ButtonLink', { label: 'Book an appointment', url: '/academics/advising' })]),
  },
  {
    key: 'services', kind: 'template', icon: 'services', label: 'Our services', description: 'A grid of services, each with a link.',
    build: () => page([b('Heading', { text: 'Our services', level: 'h1' }), b('RichText', { markdown: 'Choose a service to get started.' }), cols('1-1', [b('InfoCard', { title: 'Service one', icon: 'star', body: 'Short description.', linkLabel: 'Learn more', linkUrl: '/help' }), b('InfoCard', { title: 'Service three', icon: 'computer', body: 'Short description.' })], [b('InfoCard', { title: 'Service two', icon: 'library', body: 'Short description.' }), b('InfoCard', { title: 'Service four', icon: 'health', body: 'Short description.' })])]),
  },
  {
    key: 'team', kind: 'template', icon: 'team', label: 'Our team', description: 'People cards with roles and contact details.',
    build: () => page([b('Heading', { text: 'Meet the team', level: 'h1', subtitle: 'The people who can help you.' }), cols('1-1-1', [b('ContactCard', { name: 'Full name', role: 'Director', email: 'name@feddrick.edu' })], [b('ContactCard', { name: 'Full name', role: 'Advisor', email: 'name@feddrick.edu' })], [b('ContactCard', { name: 'Full name', role: 'Coordinator', email: 'name@feddrick.edu' })])]),
  },
  {
    key: 'contact', kind: 'template', icon: 'contact', label: 'Contact us', description: 'Contact cards for several offices.',
    build: () => page([b('Heading', { text: 'Contact us', level: 'h1' }), cols('1-1-1', [b('ContactCard', { name: 'Admissions', email: 'admissions@feddrick.edu' })], [b('ContactCard', { name: 'Registrar', email: 'registrar@feddrick.edu' })], [b('ContactCard', { name: 'IT services', email: 'it@feddrick.edu' })])]),
  },
  {
    key: 'gallery', kind: 'template', icon: 'gallery', label: 'Image gallery', description: 'A heading and a grid of images from the media library.',
    build: () => page([b('Heading', { text: 'Gallery', level: 'h1', subtitle: 'Choose each image from the media library.' }), ...[0, 1].map(() => cols('1-1-1', [b('Image', { aspectRatio: '4:3', alt: '' })], [b('Image', { aspectRatio: '4:3', alt: '' })], [b('Image', { aspectRatio: '4:3', alt: '' })]))], 'wide'),
  },
  { key: 'news', kind: 'template', icon: 'news', label: 'News board', description: 'Campus news with a sidebar of links.', build: () => page([b('Heading', { text: 'News & announcements', level: 'h1' }), cols('2-1', [b('AnnouncementsFeed', { title: 'All notices', limit: 12 })], [b('LinkList', { heading: 'Related', links: [{ label: 'Academic calendar', url: '/academics/calendar', description: '' }, { label: 'Help & FAQs', url: '/help', description: '' }] })])]) },
  { key: 'help', kind: 'template', icon: 'help', label: 'Help & FAQs', description: 'Help articles with contact options.', build: () => page([b('Heading', { text: 'Help & FAQs', level: 'h1' }), cols('2-1', [b('FaqList', { title: 'Frequently asked questions', limit: 20 })], [b('ContactCard', { name: 'Help desk', email: 'help@feddrick.edu', hours: 'Monday–Friday 8:00–6:00' }), b('ButtonLink', { label: 'Open a ticket', url: '/help/tickets', variant: 'outlined' })])]) },
  { key: 'events', kind: 'template', icon: 'events', label: 'Events', description: 'Upcoming academic dates and highlights.', build: () => page([b('Banner', { title: 'Upcoming events', description: 'Key dates this term.', tone: 'brand' }), cols('1-1', [b('EventsList', { title: 'Academic calendar', limit: 8 })], [b('AnnouncementsFeed', { title: 'Event notices', category: 'events', limit: 5 })])]) },
  {
    key: 'information', kind: 'template', icon: 'info', label: 'Information', description: 'A heading, introduction and supporting details.',
    build: () => page([b('Heading', { text: 'Page title', level: 'h1' }), b('RichText', { markdown: 'Introduce the topic here. Use **bold**, lists and [links](/help).' }), cols('2-1', [b('RichText', { markdown: '## Details\n\nAdd the main information.' })], [b('Callout', { title: 'Good to know', body: 'Key facts or deadlines.', tone: 'info' })])], 'narrow'),
  },
  { key: 'blank-1', kind: 'blank', columns: [100], label: '1 column', description: 'An empty full-width page.', build: () => page([cols('1')]) },
  { key: 'blank-2', kind: 'blank', columns: [50, 50], label: '2 columns', description: 'Two equal columns side by side.', build: () => page([cols('1-1')]) },
  { key: 'blank-70-30', kind: 'blank', columns: [70, 30], label: '2 columns (70/30)', description: 'Main content with a sidebar on the right.', build: () => page([{ ...cols('2-1'), props: { ...cols('2-1').props, col1Width: 70, col2Width: 30 } }]) },
  { key: 'blank-30-70', kind: 'blank', columns: [30, 70], label: '2 columns (30/70)', description: 'A sidebar on the left of the main content.', build: () => page([{ ...cols('1-2'), props: { ...cols('1-2').props, col1Width: 30, col2Width: 70 } }]) },
  { key: 'blank-3', kind: 'blank', columns: [34, 33, 33], label: '3 columns', description: 'Three equal columns.', build: () => page([cols('1-1-1')]) },
];

/** Default dashboard layout: every catalogue widget, in its default order, nothing hidden. */
export const defaultDashboardLayout = (catalogue) => ({ root: { props: { hidden: [] } }, content: catalogue.map((w) => b('DashboardWidget', { widgetKey: w.key, title: '', subtitle: '', size: 'default' })) });

export const slugify = (text) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

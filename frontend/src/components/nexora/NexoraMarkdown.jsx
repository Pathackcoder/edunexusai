import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { isSafeUrl } from '../../../../shared/cmsBlocks.js';
import { nexora } from './nexoraStyle';

/**
 * Nexora's answers: Markdown with GitHub tables. Raw HTML is never rendered, and links follow the portal's safe URL
 * rules (portal paths open in place; https links open in a new tab).
 */
const transform = (url) => (isSafeUrl(url) ? url : '');

const MdLink = ({ href = '', children }) => {
  if (!href) return <span>{children}</span>;
  if (href.startsWith('/')) return <Link component={RouterLink} to={href} underline="hover" fontWeight={600}>{children}</Link>;
  return <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" fontWeight={600}>{children}</Link>;
};

const Table = ({ children }) => (
  <Box sx={{ my: 1.5, overflowX: 'auto', borderRadius: 3, border: 1, borderColor: nexora.hairline, bgcolor: 'rgba(255,255,255,0.7)' }}>
    <Box component="table">{children}</Box>
  </Box>
);

export const NexoraMarkdown = memo(function NexoraMarkdown({ children }) {
  return (
    <Box
      sx={{
        fontSize: { xs: '0.95rem', md: '0.98rem' },
        lineHeight: 1.7,
        color: nexora.ink,
        wordBreak: 'break-word',
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 1.1 },
        '& h1, & h2, & h3, & h4': { mt: 2.25, mb: 0.75, lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.01em' },
        '& h1': { fontSize: '1.25rem' },
        '& h2': { fontSize: '1.125rem' },
        '& h3, & h4': { fontSize: '1rem' },
        '& ul, & ol': { pl: 3, my: 1 },
        '& li': { my: 0.35, pl: 0.25 },
        '& li::marker': { color: 'primary.main' },
        '& strong': { fontWeight: 650 },
        '& blockquote': { m: 0, my: 1.5, pl: 2, borderLeft: 3, borderColor: 'primary.light', color: nexora.muted },
        '& code': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.86em', px: 0.6, py: 0.15, borderRadius: 1, bgcolor: 'rgba(70, 81, 222, 0.08)' },
        '& pre': { p: 1.5, borderRadius: 2.5, bgcolor: '#0F1430', color: '#E6E9F5', overflowX: 'auto', '& code': { bgcolor: 'transparent', color: 'inherit', p: 0 } },
        '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
        '& table': { borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '0.875rem', minWidth: 360 },
        '& thead th': { textAlign: 'left', fontWeight: 650, color: nexora.muted, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', bgcolor: 'rgba(70, 81, 222, 0.05)', px: 1.5, py: 1, borderBottom: 1, borderColor: nexora.hairline, whiteSpace: 'nowrap' },
        '& tbody td': { px: 1.5, py: 1, borderBottom: 1, borderColor: 'rgba(18, 24, 51, 0.06)', verticalAlign: 'top' },
        '& tbody tr:last-child td': { borderBottom: 0 },
        '& tbody tr': { transition: 'background-color 140ms ease' },
        '& tbody tr:hover': { bgcolor: 'rgba(70, 81, 222, 0.035)' },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={transform} components={{ a: MdLink, table: Table }}>
        {String(children ?? '')}
      </ReactMarkdown>
    </Box>
  );
});

export default NexoraMarkdown;

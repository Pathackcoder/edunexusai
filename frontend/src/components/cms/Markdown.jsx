import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { isSafeUrl } from '../../../../shared/cmsBlocks.js';

/**
 * CMS Markdown. react-markdown never renders raw HTML, and links/images are limited to the
 * same safe URL rules the server enforces (https, mailto, tel or a portal path).
 */
const transform = (url) => (isSafeUrl(url) ? url : '');

const MdLink = ({ href = '', children }) => {
  if (!href) return <span>{children}</span>;
  if (href.startsWith('/')) return <Link component={RouterLink} to={href}>{children}</Link>;
  return <Link href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{children}</Link>;
};

/** Typography for CMS rich content, shared by Markdown and HTML (SafeHtml) rendering. */
export const richTextSx = {
  typography: 'body1',
  color: 'text.primary',
  '& p': { my: 1 },
  '& p:first-of-type': { mt: 0 },
  '& p:last-child': { mb: 0 },
  '& h1, & h2, & h3, & h4': { mt: 2, mb: 1, lineHeight: 1.3 },
  '& ul, & ol': { pl: 3, my: 1 },
  '& img': { maxWidth: '100%', borderRadius: 2 },
  '& blockquote': { m: 0, pl: 2, borderLeft: 3, borderColor: 'divider', color: 'text.secondary' },
  '& code': { fontFamily: 'monospace', fontSize: '0.9em', px: 0.5, borderRadius: 1, bgcolor: 'action.hover' },
  '& pre': { p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', overflowX: 'auto' },
  '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
};

export function Markdown({ children, align = 'left', sx }) {
  return (
    <Box
      sx={{
        textAlign: align,
        typography: 'body1',
        color: 'text.primary',
        '& p': { my: 1 },
        '& p:first-of-type': { mt: 0 },
        '& p:last-child': { mb: 0 },
        '& h1, & h2, & h3, & h4': { mt: 2, mb: 1, lineHeight: 1.3 },
        '& ul, & ol': { pl: 3, my: 1 },
        '& img': { maxWidth: '100%', borderRadius: 2 },
        '& blockquote': { m: 0, pl: 2, borderLeft: 3, borderColor: 'divider', color: 'text.secondary' },
        '& code': { fontFamily: 'monospace', fontSize: '0.9em', px: 0.5, borderRadius: 1, bgcolor: 'action.hover' },
        '& table': { borderCollapse: 'collapse', width: '100%' },
        '& th, & td': { border: 1, borderColor: 'divider', p: 0.75, textAlign: 'left' },
        ...sx,
      }}
    >
      <ReactMarkdown urlTransform={transform} components={{ a: MdLink }}>{String(children ?? '')}</ReactMarkdown>
    </Box>
  );
}

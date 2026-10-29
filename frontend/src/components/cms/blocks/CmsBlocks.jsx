import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MuiButton from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import LocalLibraryOutlinedIcon from '@mui/icons-material/LocalLibraryOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FormatQuoteRoundedIcon from '@mui/icons-material/FormatQuoteRounded';
import { WidgetCard } from '../../common/WidgetCard';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { contentApi, sisApi, studioApi } from '../../../services/api';
import { BOX_LIMITS, isSafeImage, isSafeUrl } from '../../../../../shared/cmsBlocks.js';
import { brand } from '../../../theme/theme';
import { Markdown } from '../Markdown';
import { RichContent, SafeHtml } from '../SafeHtml';
import { CmsForm } from '../CmsForm';
import { parseVideoUrl, videoEmbedUrl } from '../../../../../shared/video.js';

/**
 * The React components behind every page-builder block. The same components render in the
 * Studio canvas and in the live portal, so what an editor sees is what users get. Live
 * blocks read through the normal authorised APIs (CMS content for the viewer's audience,
 * the CampusCore calendar through /sis/calendar); nothing is stored in the layout.
 */

const ICONS = { info: InfoOutlinedIcon, school: SchoolOutlinedIcon, calendar: EventOutlinedIcon, people: PeopleOutlineRoundedIcon, support: SupportAgentOutlinedIcon, library: LocalLibraryOutlinedIcon, health: HealthAndSafetyOutlinedIcon, money: PaymentsOutlinedIcon, computer: ComputerOutlinedIcon, location: PlaceOutlinedIcon, star: StarOutlineRoundedIcon, campaign: CampaignOutlinedIcon, book: MenuBookOutlinedIcon, career: WorkOutlineRoundedIcon, heart: FavoriteBorderRoundedIcon, chat: ChatBubbleOutlineRoundedIcon };
const SPACE = { none: 0, sm: 1.5, md: 3, lg: 5, xl: 8 };
const GAP = { sm: 1.5, md: 2.5, lg: 4 };
const IMAGE_HEIGHT = { auto: 'auto', sm: 160, md: 280, lg: 420 };
const TEMPLATE = { 1: '1fr', '1-1': '1fr 1fr', '2-1': '2fr 1fr', '1-2': '1fr 2fr', '1-1-1': '1fr 1fr 1fr', '1-2-1': '1fr 2fr 1fr', '1-1-1-1': '1fr 1fr 1fr 1fr' };
const COLUMN_COUNT = { 1: 1, '1-1': 2, '2-1': 2, '1-2': 2, '1-1-1': 3, '1-2-1': 3, '1-1-1-1': 4 };

/** Internal paths use the router; external links open in a new tab; unsafe values render as text. */
export function SmartLink({ href, children, ...rest }) {
  if (!href || !isSafeUrl(href)) return <span>{children}</span>;
  if (href.startsWith('/')) return <Link component={RouterLink} to={href} {...rest}>{children}</Link>;
  return <Link href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" {...rest}>{children}</Link>;
}

function linkProps(href) {
  if (!href || !isSafeUrl(href)) return { disabled: true };
  if (href.startsWith('/')) return { component: RouterLink, to: href };
  return { href, target: href.startsWith('http') ? '_blank' : undefined, rel: 'noopener noreferrer' };
}

const Slot = ({ content: Content, minEmptyHeight = 64 }) => (typeof Content === 'function' ? <Content minEmptyHeight={minEmptyHeight} /> : null);

/** A stored pixel height (0 = automatic) as responsive CSS: clamped, and capped on phones. */
export function heightSx(px) {
  const h = Number(px) || 0;
  if (h <= 0) return undefined;
  const value = Math.min(Math.max(h, BOX_LIMITS.minHeight), BOX_LIMITS.maxHeight);
  return { xs: Math.min(value, BOX_LIMITS.phoneMaxHeight), md: value };
}

/**
 * Outer box of every page block: width (% of the row, from tablet up), position and spacing.
 * The Studio canvas and the live page use this same wrapper, so a size set in the editor is
 * the size users see. Phones always get the full width.
 */
export function BoxFrame({ boxWidth = 100, boxAlign = 'left', spaceAbove = 'none', spaceBelow = 'none', children, ...rest }) {
  const width = Math.min(BOX_LIMITS.maxWidth, Math.max(BOX_LIMITS.minWidth, Number(boxWidth) || 100));
  return (
    <Box
      {...rest}
      sx={{
        width: { xs: '100%', sm: `${width}%` },
        maxWidth: '100%',
        minWidth: 0,
        ml: boxAlign === 'left' ? 0 : 'auto',
        mr: boxAlign === 'right' ? 0 : 'auto',
        mt: SPACE[spaceAbove] ?? 0,
        mb: 2 + (SPACE[spaceBelow] ?? 0),
        '&:last-child': { mb: SPACE[spaceBelow] ?? 0 },
      }}
    >
      {children}
    </Box>
  );
}

/** Section heading row used by plain-framed live blocks: title, subtitle and a "view all" link. */
function SectionHeader({ title, subtitle, linkLabel, linkUrl }) {
  if (!title && !subtitle && !linkLabel) return null;
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} sx={{ mb: 2 }}>
      <Box>
        {title && <Typography variant="h4" component="h2">{title}</Typography>}
        {subtitle && <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {linkLabel && linkUrl && <SmartLink href={linkUrl} sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>{linkLabel}<ArrowForwardRoundedIcon fontSize="small" /></SmartLink>}
    </Stack>
  );
}

/* ------------------------------------------------------------------ layout */

export function SectionBlock({ title, subtitle, background, backgroundImage, padding, align, heightPx, content }) {
  const dark = background === 'brand' || background === 'dark';
  const image = backgroundImage && isSafeImage(backgroundImage) ? backgroundImage : '';
  const framed = background !== 'none' || Boolean(image);
  return (
    <Box
      component="section"
      sx={(theme) => ({
        bgcolor: { none: 'transparent', subtle: 'background.subtle', tint: alpha(theme.palette.primary.main, 0.06), brand: 'primary.main', dark: 'grey.900' }[background] ?? 'transparent',
        backgroundImage: image ? `linear-gradient(90deg, ${alpha(theme.palette.background.paper, dark ? 0 : 0.94)} 0%, ${alpha(theme.palette.background.paper, dark ? 0 : 0.7)} 55%, ${alpha(theme.palette.background.paper, 0)} 100%), url("${image}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center right',
        color: dark ? 'common.white' : 'inherit',
        borderRadius: framed ? 4 : 0,
        px: framed ? { xs: 2, md: 4 } : 0,
        py: SPACE[padding] ?? 3,
        textAlign: align,
        minHeight: heightSx(heightPx),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      })}
    >
      {title && <Typography variant="h4" component="h2" sx={{ color: 'inherit', mb: subtitle ? 0.5 : 2 }}>{title}</Typography>}
      {subtitle && <Typography variant="body1" sx={{ mb: 2, color: 'inherit', opacity: 0.75 }}>{subtitle}</Typography>}
      <Slot content={content} />
    </Box>
  );
}

/** Column template: custom widths (all set) as fractions, otherwise the chosen preset. */
export function columnTemplate(layout, widths) {
  const count = COLUMN_COUNT[layout] ?? 2;
  const custom = widths.slice(0, count).map((w) => Number(w) || 0);
  if (count > 1 && custom.every((w) => w >= BOX_LIMITS.minColumn)) return custom.map((w) => `${w}fr`).join(' ');
  return TEMPLATE[layout] ?? '1fr 1fr';
}

export function ColumnsBlock({ layout = '1-1', gap = 'md', verticalAlign = 'start', stackOn = 'mobile', col1Width = 0, col2Width = 0, col3Width = 0, col4Width = 0, column1, column2, column3, column4 }) {
  const count = COLUMN_COUNT[layout] ?? 2;
  const columns = [column1, column2, column3, column4].slice(0, count);
  const breakpoint = stackOn === 'tablet' || count === 4 ? 'md' : 'sm';
  const template = columnTemplate(layout, [col1Width, col2Width, col3Width, col4Width]);
  return (
    <Box data-cms-columns="" sx={{ display: 'grid', gap: GAP[gap] ?? 2.5, alignItems: verticalAlign, gridTemplateColumns: count === 4 ? { xs: '1fr', sm: '1fr 1fr', md: template } : { xs: '1fr', [breakpoint]: template } }}>
      {columns.map((content, i) => <Box key={i} data-cms-column={i} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', '& > *': { flex: verticalAlign === 'stretch' ? 1 : undefined } }}><Slot content={content} /></Box>)}
    </Box>
  );
}

export const SpacerBlock = ({ size = 'md', heightPx = 0 }) => <Box aria-hidden sx={{ height: heightSx(heightPx) ?? ((theme) => theme.spacing(SPACE[size] ?? 3)) }} />;
export const DividerBlock = ({ spacing = 'md' }) => <Divider sx={{ my: SPACE[spacing] ?? 3 }} />;

/* ----------------------------------------------------------------- content */

export function HeadingBlock({ text, level = 'h2', align = 'left', subtitle }) {
  const variant = { h1: 'h2', h2: 'h3', h3: 'h4', h4: 'h5' }[level] ?? 'h3';
  return (
    <Box sx={{ textAlign: align }}>
      <Typography variant={variant} component={level}>{text}</Typography>
      {subtitle && <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>{subtitle}</Typography>}
    </Box>
  );
}

export const RichTextBlock = ({ format = 'markdown', markdown, html, align }) => (format === 'html' ? <SafeHtml html={html} align={align} /> : <Markdown align={align}>{markdown}</Markdown>);

const VIDEO_RATIO = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '21:9': '21 / 9', '9:16': '9 / 16' };

/**
 * YouTube / Vimeo embed. The iframe address is built only from the parsed video id on an
 * approved player host (youtube-nocookie.com, player.vimeo.com); the stored URL is never used
 * as the src. The frame is sandboxed and gets only the permissions a player needs.
 */
export function VideoBlock({ url, title = 'Video', caption, aspectRatio = '16:9' }) {
  const video = parseVideoUrl(url);
  const src = videoEmbedUrl(video);
  const ratio = VIDEO_RATIO[aspectRatio] ?? VIDEO_RATIO['16:9'];
  if (!src) {
    return (
      <Box sx={{ aspectRatio: ratio, maxHeight: 420, display: 'grid', placeItems: 'center', border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 3, color: 'text.secondary', textAlign: 'center', p: 2 }}>
        {url ? 'This video address is not supported. Use a YouTube or Vimeo link.' : 'Add a YouTube or Vimeo video address in the block settings.'}
      </Box>
    );
  }
  return (
    <Box component="figure" sx={{ m: 0 }}>
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: ratio, borderRadius: 3, overflow: 'hidden', bgcolor: 'grey.900' }}>
        <Box
          component="iframe"
          src={src}
          title={title || 'Video'}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </Box>
      {caption && <Typography component="figcaption" variant="caption" sx={{ display: 'block', mt: 0.75 }}>{caption}</Typography>}
    </Box>
  );
}

/**
 * A Studio form. In the editor canvas it shows the saved (draft) definition, inert; on portal
 * pages and previews it loads the published definition (tenant and audience checked by the
 * server) and submits through the EduNexusAI API.
 */
export function FormBlock({ formId, showTitle = true, showDescription = true, puck }) {
  const editing = Boolean(puck?.isEditing);
  const { data, loading, error } = useApiQuery(() => (formId ? (editing ? studioApi.get('form', formId) : contentApi.form(formId)) : Promise.resolve(null)), [formId, editing]);
  const frame = (children) => <Box sx={{ p: { xs: 2, md: 3 }, border: 1, borderColor: 'divider', borderRadius: 4, bgcolor: 'background.paper' }}>{children}</Box>;
  if (!formId) return frame(<Typography color="text.secondary">Choose a form in the block settings. Forms are created under Studio → Forms.</Typography>);
  if (loading) return frame(<Loading />);
  if (error || !data) return frame(<Alert severity="info" variant="outlined">{error?.status === 404 ? 'This form is not available. It may not be published yet, or it is not meant for your role.' : 'The form could not be loaded right now.'}</Alert>);
  return frame(
    <>
      {editing && data.state && data.state !== 'published' && <Alert severity="warning" sx={{ mb: 2 }}>This form is not published{data.state === 'modified' ? ' with its latest changes' : ''}. Publish it under Studio → Forms so portal users can use it.</Alert>}
      <CmsForm key={data.id} form={data} mode={editing ? 'canvas' : 'live'} showTitle={showTitle} showDescription={showDescription} onSubmit={(body) => contentApi.submitForm(formId, body)} />
    </>,
  );
}

const RATIO = { '21:9': '21 / 9', '16:9': '16 / 9', '3:2': '3 / 2', '4:3': '4 / 3', '1:1': '1 / 1' };

export function ImageBlock({ src, alt, caption, fit = 'cover', height = 'auto', heightPx = 0, aspectRatio = 'auto', focus = 'center', rounded = true, link }) {
  if (!src || !isSafeImage(src)) return <Box sx={{ p: 3, minHeight: heightSx(heightPx), border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 2, color: 'text.secondary', textAlign: 'center', display: 'grid', placeItems: 'center' }}>Choose an image</Box>;
  const fixed = heightSx(heightPx);
  const img = <Box component="img" src={src} alt={alt || ''} loading="lazy" sx={{ display: 'block', width: '100%', height: fixed ?? (RATIO[aspectRatio] ? 'auto' : IMAGE_HEIGHT[height] ?? 'auto'), aspectRatio: !fixed && RATIO[aspectRatio] ? RATIO[aspectRatio] : undefined, objectFit: fit, objectPosition: focus, borderRadius: rounded ? 3 : 0 }} />;
  return (
    <Box component="figure" sx={{ m: 0 }}>
      {link ? <SmartLink href={link} underline="none">{img}</SmartLink> : img}
      {caption && <Typography component="figcaption" variant="caption" sx={{ display: 'block', mt: 0.75 }}>{caption}</Typography>}
    </Box>
  );
}

const OVERLAY = { none: [0, 0], light: [0.45, 0.05], medium: [0.78, 0.15], strong: [0.9, 0.45] };
const TITLE_SIZE = { md: { xs: '1.75rem', md: '2.4rem' }, lg: { xs: '2rem', md: '3rem' }, xl: { xs: '2.2rem', md: '3.6rem' } };

function HighlightedTitle({ title, highlight }) {
  const at = highlight ? title.indexOf(highlight) : -1;
  if (at < 0) return title;
  return <>{title.slice(0, at)}<Box component="span" sx={{ color: brand.cyan }}>{highlight}</Box>{title.slice(at + highlight.length)}</>;
}

export function BannerBlock({ eyebrow, title = '', highlight, titleSize = 'md', description, ctaLabel, ctaUrl, secondaryLabel, secondaryUrl, image, overlay = 'medium', tone = 'brand', align = 'left', contentWidth = 65, heightPx = 0, stats = [] }) {
  const hasImage = Boolean(image && isSafeImage(image));
  const dark = hasImage ? overlay !== 'none' || tone !== 'light' : tone !== 'light';
  const [from, to] = OVERLAY[overlay] ?? OVERLAY.medium;
  const width = Math.min(100, Math.max(30, Number(contentWidth) || 65));
  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
        px: { xs: 2.5, md: 6 },
        py: { xs: 4, md: 7 },
        minHeight: heightSx(heightPx),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        color: dark ? 'common.white' : 'text.primary',
        bgcolor: tone === 'brand' ? 'primary.main' : tone === 'dark' ? brand.navyDeep : 'background.subtle',
        backgroundImage: hasImage
          ? `linear-gradient(${align === 'right' ? 270 : 90}deg, ${alpha('#0B1240', from)} 0%, ${alpha('#0B1240', (from + to) / 2)} 45%, ${alpha('#0B1240', to)} 100%), url("${image}")`
          : tone === 'brand' ? `linear-gradient(120deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main} 60%, ${theme.palette.secondary.main})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      })}
    >
      <Box sx={{ width: { xs: '100%', md: `${width}%` } }}>
        {eyebrow && <Typography variant="overline" sx={{ color: dark ? brand.cyan : 'primary.main', letterSpacing: '0.12em', fontWeight: 700 }}>{eyebrow}</Typography>}
        <Typography variant="h2" component="h2" sx={{ color: 'inherit', fontSize: TITLE_SIZE[titleSize] ?? TITLE_SIZE.md, lineHeight: 1.12, fontWeight: 800 }}>
          <HighlightedTitle title={title} highlight={highlight} />
        </Typography>
        {description && <Markdown align={align} sx={{ color: 'inherit', opacity: 0.9, mt: 2, fontSize: { md: '1.05rem' }, '& a': { color: 'inherit' } }}>{description}</Markdown>}
        {((ctaLabel && ctaUrl) || (secondaryLabel && secondaryUrl)) && (
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 3, justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
            {ctaLabel && ctaUrl && (
              <MuiButton size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} sx={dark ? { bgcolor: brand.cyan, color: '#06243A', '&:hover': { bgcolor: '#67E8F9' } } : undefined} {...linkProps(ctaUrl)}>{ctaLabel}</MuiButton>
            )}
            {secondaryLabel && secondaryUrl && (
              <MuiButton size="large" variant="outlined" color="inherit" sx={dark ? { borderColor: alpha('#FFFFFF', 0.7), '&:hover': { borderColor: '#FFFFFF', bgcolor: alpha('#FFFFFF', 0.08) } } : undefined} {...linkProps(secondaryUrl)}>{secondaryLabel}</MuiButton>
            )}
          </Stack>
        )}
      </Box>
      {stats.length > 0 && (
          <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap flexWrap="wrap" sx={{ mt: 4, gap: { xs: 1.5, md: 0 }, justifyContent: align === 'center' ? 'center' : 'flex-start' }} divider={<Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: alpha(dark ? '#FFFFFF' : '#000000', 0.2), mx: 3, display: { xs: 'none', md: 'block' } }} />}>
            {stats.map((st, i) => {
              const Icon = ICONS[st.icon] ?? MenuBookOutlinedIcon;
              return (
                <Stack key={i} direction="row" spacing={1.25} alignItems="center">
                  <Icon sx={{ fontSize: 30, opacity: 0.9 }} />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.1, color: 'inherit' }}>{st.value}</Typography>
                    <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.85 }}>{st.label}</Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
      )}
    </Box>
  );
}

export const CalloutBlock = ({ title, body, tone = 'info' }) => (
  <Alert severity={tone} sx={{ borderRadius: 3, '& .MuiAlert-message': { width: '100%' } }}>
    {title && <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700, mb: body ? 0.5 : 0 }}>{title}</Typography>}
    {body && <Markdown sx={{ fontSize: '0.875rem', color: 'inherit' }}>{body}</Markdown>}
  </Alert>
);

export function InfoCardBlock({ title, body, icon = 'info', image, variant = 'standard', accent = 'primary', linkLabel, linkUrl, heightPx = 0 }) {
  const Icon = ICONS[icon] ?? InfoOutlinedIcon;
  const hasImage = Boolean(image && isSafeImage(image));
  if (variant === 'feature' || hasImage) {
    return (
      <Box sx={(theme) => ({ height: '100%', minHeight: heightSx(heightPx), display: 'flex', flexDirection: 'column', borderRadius: 4, overflow: 'hidden', bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: `0 10px 30px -18px ${alpha(theme.palette.common.black, 0.35)}`, transition: 'transform 160ms ease, box-shadow 160ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 16px 36px -18px ${alpha(theme.palette.common.black, 0.4)}` } })}>
        <Box sx={(theme) => { const c = theme.palette[accent]?.main ?? theme.palette.primary.main; return { position: 'relative', height: hasImage ? 150 : 96, flexShrink: 0, bgcolor: alpha(c, 0.1), backgroundImage: hasImage ? `url("${image}")` : `radial-gradient(120% 140% at 100% 0%, ${alpha(c, 0.28)} 0%, ${alpha(c, 0.06)} 60%, transparent 100%)`, backgroundSize: 'cover', backgroundPosition: 'center' }; }}>
          {!hasImage && <Icon aria-hidden sx={{ position: 'absolute', right: 16, top: 12, fontSize: 64, color: `${accent}.main`, opacity: 0.18 }} />}
          <Box sx={(theme) => ({ position: 'absolute', left: 18, bottom: -24, width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: theme.palette[accent]?.lighter ?? alpha(theme.palette[accent]?.main ?? theme.palette.primary.main, 0.15), color: `${accent}.main`, border: '4px solid', borderColor: 'background.paper' })}>
            <Icon />
          </Box>
        </Box>
        <Box sx={{ p: 2.5, pt: 4.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" component="h3" sx={{ mb: 0.75 }}>{title}</Typography>
          {body && <Markdown sx={{ fontSize: '0.9rem', color: 'text.secondary', flex: 1 }}>{body}</Markdown>}
          {linkLabel && linkUrl && <SmartLink href={linkUrl} sx={{ mt: 1.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{linkLabel}<ArrowForwardRoundedIcon fontSize="small" /></SmartLink>}
        </Box>
      </Box>
    );
  }
  return (
    <Box sx={{ height: '100%', minHeight: heightSx(heightPx), '& > *': { height: '100%' } }}>
      <WidgetCard title={title} icon={Icon} tone={accent} actionLabel={linkLabel && linkUrl && linkUrl.startsWith('/') ? linkLabel : undefined} actionTo={linkLabel && linkUrl?.startsWith('/') ? linkUrl : undefined}>
        {body && <Markdown sx={{ fontSize: '0.9rem' }}>{body}</Markdown>}
        {linkLabel && linkUrl && !linkUrl.startsWith('/') && <SmartLink href={linkUrl} sx={{ mt: 1.5, display: 'inline-block', fontWeight: 600 }}>{linkLabel}</SmartLink>}
      </WidgetCard>
    </Box>
  );
}

export function LinkListBlock({ heading, links = [], variant = 'card' }) {
  if (variant === 'buttons') {
    return (
      <Stack spacing={1.25}>
        {heading && <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>{heading}</Typography>}
        {links.map((l, i) => {
          const Icon = ICONS[l.icon] ?? InfoOutlinedIcon;
          return (
            <MuiButton key={i} {...linkProps(l.url)} startIcon={<Icon />} sx={(theme) => ({ justifyContent: 'flex-start', px: 2, py: 1.25, borderRadius: 2.5, bgcolor: 'background.paper', color: 'text.primary', border: 1, borderColor: 'divider', fontWeight: 600, boxShadow: `0 4px 14px -10px ${alpha(theme.palette.common.black, 0.4)}`, '& .MuiButton-startIcon': { color: 'primary.main' }, '&:hover': { bgcolor: 'background.paper', borderColor: 'primary.main' } })}>
              {l.label}
            </MuiButton>
          );
        })}
      </Stack>
    );
  }
  return (
    <WidgetCard title={heading} icon={OpenInNewRoundedIcon}>
      {links.length === 0 && <Typography variant="body2" color="text.secondary">No links yet.</Typography>}
      <Stack divider={<Divider flexItem />} spacing={1}>
        {links.map((l, i) => (
          <Box key={i}>
            <SmartLink href={l.url} sx={{ fontWeight: 600 }}>{l.label}</SmartLink>
            {l.description && <Typography variant="caption" component="p" color="text.secondary">{l.description}</Typography>}
          </Box>
        ))}
      </Stack>
    </WidgetCard>
  );
}

export const ButtonLinkBlock = ({ label, url, variant = 'contained', align = 'left' }) => (
  <Box sx={{ textAlign: align }}>
    <MuiButton variant={variant} {...linkProps(url)}>{label}</MuiButton>
  </Box>
);

export function ContactCardBlock({ name, role, email, phone, location, hours }) {
  const row = (Icon, content) => content && <Stack direction="row" spacing={1} alignItems="center"><Icon fontSize="small" color="action" /><Typography variant="body2" component="span">{content}</Typography></Stack>;
  return (
    <WidgetCard title={name} subtitle={role || undefined} icon={SupportAgentOutlinedIcon}>
      <Stack spacing={1}>
        {row(MailOutlineRoundedIcon, email && <SmartLink href={`mailto:${email}`}>{email}</SmartLink>)}
        {row(PhoneOutlinedIcon, phone && <SmartLink href={`tel:${phone.replace(/[^+0-9]/g, '')}`}>{phone}</SmartLink>)}
        {row(PlaceOutlinedIcon, location)}
        {row(ScheduleRoundedIcon, hours)}
      </Stack>
    </WidgetCard>
  );
}

/* -------------------------------------------------------------------- live */

const Loading = () => <Stack spacing={1}><Skeleton height={28} /><Skeleton height={28} /><Skeleton height={28} /></Stack>;
const Unavailable = ({ what }) => <Alert severity="info" variant="outlined">{what} could not be loaded right now.</Alert>;

const CATEGORY_TONE = { academic: 'primary', events: 'secondary', 'campus-life': 'success', finance: 'warning', safety: 'error', 'it-services': 'info', wellness: 'success', general: 'info' };
const formatDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

function EmptyState({ icon: Icon, title, text }) {
  return (
    <Stack alignItems="center" spacing={1} sx={{ py: 4, px: 2, textAlign: 'center', border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 3, color: 'text.secondary' }}>
      <Icon color="primary" />
      <Typography variant="subtitle2" color="text.primary">{title}</Typography>
      <Typography variant="body2">{text}</Typography>
    </Stack>
  );
}

function AnnouncementCards({ items, layout }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: layout === 'cards' ? { xs: '1fr', sm: 'repeat(auto-fill, minmax(240px, 1fr))' } : '1fr' }}>
      {items.map((a) => (
        <Box key={a.id} sx={(theme) => ({ p: 2, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', boxShadow: layout === 'cards' ? `0 8px 24px -18px ${alpha(theme.palette.common.black, 0.35)}` : 'none' })}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 0.75 }}>
            {a.pinned && <Chip size="small" color="primary" label="Pinned" />}
            {a.priority !== 'normal' && <Chip size="small" color={a.priority === 'urgent' ? 'error' : 'warning'} label={a.priority === 'urgent' ? 'Urgent' : 'Important'} />}
            <Chip size="small" variant="outlined" color={CATEGORY_TONE[a.category] ?? 'default'} label={a.category.replace('-', ' ')} sx={{ textTransform: 'capitalize' }} />
          </Stack>
          {(a.publishedAt || a.updatedAt) && <Typography variant="caption" color="text.secondary">{formatDate(a.publishedAt || a.updatedAt)}</Typography>}
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{a.title}</Typography>
          {a.summary && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{a.summary}</Typography>}
          {a.body && layout === 'list' && <Box sx={{ mt: 0.75 }}><RichContent format={a.bodyFormat} value={a.body} sx={{ fontSize: '0.875rem' }} /></Box>}
          <Box sx={{ flex: 1 }} />
          {a.ctaLabel && a.ctaUrl
            ? <SmartLink href={a.ctaUrl} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1.25, fontWeight: 600 }}>{a.ctaLabel}<ArrowForwardRoundedIcon fontSize="small" /></SmartLink>
            : layout === 'cards' && <SmartLink href="/campus/news" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1.25, fontWeight: 600 }}>Read more<ArrowForwardRoundedIcon fontSize="small" /></SmartLink>}
        </Box>
      ))}
    </Box>
  );
}

export function AnnouncementsFeedBlock({ title, subtitle, category = 'all', limit = 5, layout = 'list', frame = 'card', linkLabel, linkUrl }) {
  const { data, loading, error } = useApiQuery(() => contentApi.announcements({ category: category === 'all' ? undefined : category, limit }), [category, limit]);
  const items = data ?? [];
  const body = loading ? <Loading /> : error ? <Unavailable what="Campus news" /> : items.length === 0
    ? <EmptyState icon={CampaignOutlinedIcon} title="No announcements right now" text="New campus notices will appear here as soon as they are published." />
    : <AnnouncementCards items={items} layout={layout} />;
  if (frame === 'plain') return <Box><SectionHeader title={title} subtitle={subtitle} linkLabel={linkLabel} linkUrl={linkUrl} />{body}</Box>;
  return (
    <WidgetCard title={title} icon={CampaignOutlinedIcon} subtitle={subtitle || 'Campus news'} actionLabel={linkLabel && linkUrl?.startsWith('/') ? linkLabel : undefined} actionTo={linkLabel && linkUrl?.startsWith('/') ? linkUrl : undefined}>
      {body}
    </WidgetCard>
  );
}

export function FaqListBlock({ title, subtitle, category, limit = 10, frame = 'card', linkLabel, linkUrl }) {
  const { data, loading, error } = useApiQuery(() => contentApi.faqs({ category: category || undefined, limit }), [category, limit]);
  const items = data ?? [];
  const plain = frame === 'plain';
  const body = loading ? <Loading /> : error ? <Unavailable what="Help articles" /> : items.length === 0
    ? <EmptyState icon={SupportAgentOutlinedIcon} title="No help articles yet" text="Answers to common questions will appear here once they are published." />
    : (
      <Stack spacing={plain ? 1.25 : 0}>
        {items.map((f) => (
          <Accordion key={f.id} disableGutters elevation={0} sx={plain ? { border: 1, borderColor: 'divider', borderRadius: '12px !important', '&:before': { display: 'none' }, overflow: 'hidden' } : { border: 1, borderColor: 'divider', '&:not(:last-of-type)': { borderBottom: 0 }, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={plain ? <AddRoundedIcon color="primary" /> : <ExpandMoreRoundedIcon />} sx={plain ? { '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(45deg)' } } : undefined}><Typography variant="subtitle2">{f.question}</Typography></AccordionSummary>
            <AccordionDetails><RichContent format={f.answerFormat} value={f.answer} sx={{ fontSize: '0.9rem' }} /></AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    );
  if (plain) return <Box><SectionHeader title={title} subtitle={subtitle} linkLabel={linkLabel} linkUrl={linkUrl} />{body}</Box>;
  return (
    <WidgetCard title={title} subtitle={subtitle || undefined} icon={SupportAgentOutlinedIcon} actionLabel={linkLabel && linkUrl?.startsWith('/') ? linkLabel : undefined} actionTo={linkLabel && linkUrl?.startsWith('/') ? linkUrl : undefined}>
      {body}
    </WidgetCard>
  );
}

export function QuoteBlock({ quote, attribution, image, heightPx = 0 }) {
  const hasImage = Boolean(image && isSafeImage(image));
  return (
    <Box component="figure" sx={(theme) => ({ m: 0, position: 'relative', overflow: 'hidden', borderRadius: 4, minHeight: heightSx(heightPx) ?? 240, height: '100%', p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', color: 'common.white', bgcolor: brand.navyDeep, backgroundImage: hasImage ? `linear-gradient(180deg, ${alpha('#0B1240', 0.75)} 0%, ${alpha('#0B1240', 0.25)} 70%), url("${image}")` : `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.main})`, backgroundSize: 'cover', backgroundPosition: 'center' })}>
      <FormatQuoteRoundedIcon sx={{ fontSize: 40, opacity: 0.8 }} />
      <Typography component="blockquote" sx={{ m: 0, fontSize: { xs: '1.25rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.3, color: 'inherit' }}>{quote}</Typography>
      {attribution && <Typography component="figcaption" sx={{ mt: 1.5, opacity: 0.9, color: 'inherit' }}>— {attribution}</Typography>}
    </Box>
  );
}

export function EventsListBlock({ title, limit = 5, categories = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, loading, error } = useApiQuery(() => sisApi.calendar({ from: today }), [today]);
  // `categories` (optional) keeps only those kinds of dates, e.g. no internal deadlines for alumni.
  const items = (Array.isArray(data) ? data : []).filter((e) => !categories || categories.includes(e.category)).slice(0, limit);
  return (
    <WidgetCard title={title} icon={EventOutlinedIcon} subtitle="CampusCore academic calendar">
      {loading ? <Loading /> : error ? <Unavailable what="The academic calendar" /> : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No upcoming dates.</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((e) => (
            <Stack key={e.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2.5 }}>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 2, bgcolor: 'primary.lighter', color: 'primary.dark', typography: 'caption', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.startDate}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" component="h3">{e.title}</Typography>
                {e.category && <Typography variant="caption" color="text.secondary">{String(e.category).toLowerCase()}</Typography>}
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
    </WidgetCard>
  );
}

/** Block type -> component, shared by the editor config and the dashboard renderer. */
export const BLOCK_COMPONENTS = {
  Section: SectionBlock,
  Columns: ColumnsBlock,
  Spacer: SpacerBlock,
  Divider: DividerBlock,
  Heading: HeadingBlock,
  RichText: RichTextBlock,
  Image: ImageBlock,
  Banner: BannerBlock,
  Callout: CalloutBlock,
  InfoCard: InfoCardBlock,
  LinkList: LinkListBlock,
  ButtonLink: ButtonLinkBlock,
  ContactCard: ContactCardBlock,
  AnnouncementsFeed: AnnouncementsFeedBlock,
  FaqList: FaqListBlock,
  EventsList: EventsListBlock,
  Quote: QuoteBlock,
  Video: VideoBlock,
  Form: FormBlock,
};

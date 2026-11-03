import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { publicApi, PUBLIC_TENANT } from '../../services/api/publicApi';
import { ErrorPanel } from '../../components/common/DataState';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { Markdown } from '../../components/cms/Markdown';
import { SafeHtml } from '../../components/cms/SafeHtml';
import { CmsPageRenderer } from '../../components/cms/CmsPageRenderer';
import { GuestShell, HEADER_HEIGHT, scrollToSection } from './GuestShell';
import { APPLY_STEPS, STUDY_AREAS } from './guestContent';

/**
 * The public experience for prospective students and visitors (/visit). No account, no sign-in, no
 * role: it reads only /api/v1/public, which serves content published for the "Public" audience and
 * the public academic dates. Everything personal stays behind sign-in.
 *
 * Layout note: rows that hold expandable content use a grid aligned to the top of each row
 * (`alignItems: 'start'`) and cards sized by their content, so opening one card never stretches the
 * card beside it. Each expandable group keeps its own state.
 */

const parseDate = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (iso, options) => parseDate(iso).toLocaleDateString(undefined, options);

/** A page section with an anchor (focusable for keyboard users, offset under the sticky header). */
function Section({ id, eyebrow, title, intro, action, children }) {
  return (
    <Box component="section" id={id} tabIndex={-1} aria-labelledby={`${id}-title`} sx={{ scrollMarginTop: HEADER_HEIGHT + 16, outline: 'none' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-end' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && <Typography variant="overline" color="primary" sx={{ fontWeight: 700, lineHeight: 1.6 }}>{eyebrow}</Typography>}
          <Typography id={`${id}-title`} variant="h5" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
          {intro && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>{intro}</Typography>}
        </Box>
        {action && <Box sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, flexShrink: 0 }}>{action}</Box>}
      </Stack>
      {children}
    </Box>
  );
}

/**
 * Responsive card grid. Rows of fixed content (no expandable parts) may give their cards equal heights
 * (`equal`); anything that can grow is laid out with `alignItems: 'start'`, so it never stretches a
 * neighbour. `auto-fit` lets a short row use the full width instead of leaving empty columns.
 */
const CardGrid = ({ min = 240, equal = false, children }) => (
  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, alignItems: equal ? 'stretch' : 'start' }}>{children}</Box>
);

const Card = ({ children, sx, ...rest }) => (
  <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3, minWidth: 0, ...sx }} {...rest}>{children}</Paper>
);

const IllustrativeChip = () => <Chip size="small" variant="outlined" label="Illustrative" sx={{ fontWeight: 600 }} />;

const Rows = ({ rows = 3, height = 72 }) => <Stack spacing={1}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} variant="rounded" height={height} />)}</Stack>;

/** Announcement call to action: visitor pages in-app, https links in a new tab, nothing else. */
function CtaLink({ url, label }) {
  if (!url || !label) return null;
  if (url.startsWith('/visit')) return <Button size="small" component={RouterLink} to={url} endIcon={<ArrowForwardRoundedIcon />} sx={{ px: 0, mt: 1 }}>{label}</Button>;
  if (url.startsWith('https://')) return <Button size="small" href={url} target="_blank" rel="noopener noreferrer" endIcon={<ArrowForwardRoundedIcon />} sx={{ px: 0, mt: 1 }}>{label}</Button>;
  return null;
}

/**
 * FAQ group. One answer open at a time within this group: the open item is this component's own
 * state, keyed by each question's stable id, so no other part of the page is affected.
 */
function FaqGroup({ faqs }) {
  const [openId, setOpenId] = useState(null);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      {faqs.map((f, index) => {
        const domId = `guest-faq-${String(f.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
        return (
          <Accordion
            key={f.id}
            disableGutters
            elevation={0}
            expanded={openId === f.id}
            onChange={(_event, isOpen) => setOpenId(isOpen ? f.id : null)}
            TransitionProps={{ unmountOnExit: true }}
            sx={{ '&:before': { display: 'none' }, borderTop: index ? 1 : 0, borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} id={`${domId}-question`} aria-controls={`${domId}-answer`} sx={{ px: 2.25, '& .MuiAccordionSummary-content': { my: 1.5, minWidth: 0 } }}>
              <Typography variant="subtitle2" component="h3" sx={{ overflowWrap: 'anywhere' }}>{f.question}</Typography>
            </AccordionSummary>
            <AccordionDetails id={`${domId}-answer`} role="region" aria-labelledby={`${domId}-question`} sx={{ px: 2.25, pt: 0, pb: 2, overflowWrap: 'anywhere' }}>
              {f.answerFormat === 'html' ? <SafeHtml html={f.answer} /> : <Markdown>{f.answer}</Markdown>}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Paper>
  );
}

export function PublicLandingPage() {
  const { data, loading, error, refetch } = useApiQuery(() => publicApi.home(PUBLIC_TENANT), []);
  const location = useLocation();
  const institution = data?.institution;
  const pages = data?.pages ?? [];
  const announcements = data?.announcements ?? [];
  const calendar = data?.calendar ?? [];
  const faqs = data?.faqs ?? [];
  const admissionsPage = pages.find((p) => p.slug === 'admissions');
  const visitPage = pages.find((p) => p.slug === 'visit-campus');

  // Arriving from another visitor page with /visit#section: scroll there once the content is in place.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!loading && id) requestAnimationFrame(() => scrollToSection(id));
  }, [loading, location.hash]);

  const paths = [
    { key: 'study', icon: MenuBookOutlinedIcon, title: 'Find a subject', text: 'Browse our areas of study.', onClick: () => scrollToSection('study') },
    { key: 'apply', icon: AssignmentTurnedInOutlinedIcon, title: 'How to apply', text: 'The steps from interest to enrolment.', onClick: () => scrollToSection('admissions') },
    { key: 'visit', icon: PlaceOutlinedIcon, title: 'Visit campus', text: 'Tours, open days and directions.', onClick: () => scrollToSection('visit') },
    { key: 'faq', icon: HelpOutlineRoundedIcon, title: 'Ask a question', text: 'Answers to common questions.', onClick: () => scrollToSection('faq') },
  ];

  return (
    <GuestShell institution={institution} pages={pages}>
      <Stack spacing={{ xs: 4, md: 5 }}>
        <HeroBanner
          eyebrow="Prospective students & visitors"
          title={`Discover ${institution?.name ?? 'the university'}`}
          description="Areas of study, admissions, campus visits and upcoming dates, all in one place. No account needed."
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
            {admissionsPage
              ? <Button component={RouterLink} to="/visit/pages/admissions" variant="contained" color="secondary">How to apply</Button>
              : <Button variant="contained" color="secondary" onClick={() => scrollToSection('admissions')}>How to apply</Button>}
            {visitPage
              ? <Button component={RouterLink} to="/visit/pages/visit-campus" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}>Plan a visit</Button>
              : <Button variant="outlined" onClick={() => scrollToSection('visit')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}>Plan a visit</Button>}
            <Button variant="text" onClick={() => scrollToSection('dates')} sx={{ color: '#fff' }}>Upcoming dates</Button>
          </Stack>
        </HeroBanner>

        {error && (
          <Box>
            <ErrorPanel compact error={error} onRetry={refetch} />
          </Box>
        )}

        <Box component="nav" aria-label="Start here">
          <CardGrid min={220} equal>
            {paths.map(({ key, icon: Icon, title, text, onClick }) => (
              <Card key={key} component="button" type="button" onClick={onClick} sx={{ textAlign: 'left', cursor: 'pointer', bgcolor: 'background.paper', font: 'inherit', color: 'inherit', transition: 'border-color 150ms, box-shadow 150ms', '&:hover, &:focus-visible': { borderColor: 'primary.main', boxShadow: 2, outline: 'none' } }}>
                <Icon color="primary" />
                <Typography variant="subtitle1" component="span" sx={{ display: 'block', fontWeight: 700, mt: 1 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ display: 'block' }}>{text}</Typography>
              </Card>
            ))}
          </CardGrid>
        </Box>

        <Section id="study" eyebrow="Study" title="Areas of study" intro="An overview of the subjects taught. The Admissions page lists the programmes currently open for application." action={<IllustrativeChip />}>
          <CardGrid min={240} equal>
            {STUDY_AREAS.map((area) => (
              <Card key={area.key}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>{area.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{area.text}</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                  {area.levels.map((level) => <Chip key={level} size="small" label={level} />)}
                </Stack>
              </Card>
            ))}
          </CardGrid>
        </Section>

        <Section
          id="admissions"
          eyebrow="Admissions"
          title="From interest to enrolment"
          intro="The usual route for new students. Official requirements and instructions are on the Admissions page."
          action={admissionsPage ? <Button component={RouterLink} to="/visit/pages/admissions" variant="contained" endIcon={<ArrowForwardRoundedIcon />}>Admissions details</Button> : <IllustrativeChip />}
        >
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', alignItems: 'stretch' }}>
            {APPLY_STEPS.map((step, index) => (
              <Card key={step.key} component="li">
                <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, mb: 1 }}>{index + 1}</Box>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>{step.title}</Typography>
                <Typography variant="body2" color="text.secondary">{step.text}</Typography>
              </Card>
            ))}
          </Box>
        </Section>

        <Section id="visit" eyebrow="Visit" title="Visit and find out more" intro="Information pages published for visitors.">
          {loading ? <Rows rows={2} /> : pages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No visitor pages are published yet.</Typography>
          ) : (
            <CardGrid min={260} equal>
              {pages.map((p) => (
                <Card key={p.slug} component={RouterLink} to={`/visit/pages/${p.slug}`} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', transition: 'border-color 150ms', '&:hover, &:focus-visible': { borderColor: 'primary.main', outline: 'none' } }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{p.title}</Typography>
                  {p.summary && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{p.summary}</Typography>}
                  <Typography variant="body2" color="primary" sx={{ mt: 1, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Read more <ArrowForwardRoundedIcon fontSize="inherit" /></Typography>
                </Card>
              ))}
            </CardGrid>
          )}
        </Section>

        <Box sx={{ display: 'grid', gap: { xs: 4, md: 3 }, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
          <Section id="news" eyebrow="News" title="News for visitors">
            {loading ? <Rows rows={3} /> : announcements.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No public news right now.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {announcements.map((a) => (
                  <Card key={a.id}>
                    {a.publishedAt && <Typography variant="caption" color="text.secondary">{new Date(a.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Typography>}
                    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{a.title}</Typography>
                    {a.summary && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{a.summary}</Typography>}
                    <CtaLink url={a.ctaUrl} label={a.ctaLabel} />
                  </Card>
                ))}
              </Stack>
            )}
          </Section>

          <Section id="dates" eyebrow="Dates" title="Upcoming dates" intro="From the academic calendar.">
            {loading ? <Rows rows={4} height={56} /> : calendar.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No upcoming public dates.</Typography>
            ) : (
              <Paper variant="outlined" component="ol" sx={{ listStyle: 'none', p: 0, m: 0, borderRadius: 3, overflow: 'hidden' }}>
                {calendar.map((e, index) => (
                  <Stack key={e.id} component="li" direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.25, borderTop: index ? 1 : 0, borderColor: 'divider' }}>
                    <Box sx={{ width: 52, flexShrink: 0, textAlign: 'center', borderRadius: 2, bgcolor: 'action.hover', py: 0.5 }}>
                      <Typography variant="caption" component="div" color="text.secondary" sx={{ textTransform: 'uppercase', lineHeight: 1.2 }}>{fmt(e.startDate, { month: 'short' })}</Typography>
                      <Typography variant="subtitle1" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{parseDate(e.startDate).getDate()}</Typography>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{e.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        <time dateTime={e.startDate}>{fmt(e.startDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</time>
                        {e.endDate ? <> – <time dateTime={e.endDate}>{fmt(e.endDate, { day: 'numeric', month: 'short' })}</time></> : null}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Paper>
            )}
          </Section>
        </Box>

        <Section id="faq" eyebrow="FAQ" title="Questions from visitors">
          {loading ? <Rows rows={3} height={52} /> : faqs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No questions published yet.</Typography>
          ) : <FaqGroup faqs={faqs} />}
        </Section>

        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>Already part of {institution?.shortName ?? 'the university'}?</Typography>
              <Typography variant="body2" color="text.secondary">Students, faculty, staff and alumni sign in for their own portal.</Typography>
            </Box>
            <Button component={RouterLink} to="/login" variant="contained" startIcon={<LoginRoundedIcon />} sx={{ flexShrink: 0 }}>Sign in</Button>
          </Stack>
        </Paper>
      </Stack>
    </GuestShell>
  );
}

export function PublicCmsPage() {
  const { slug } = useParams();
  const home = useApiQuery(() => publicApi.home(PUBLIC_TENANT), []);
  const { data, loading, error, refetch } = useApiQuery(() => publicApi.page(PUBLIC_TENANT, slug), [slug]);
  return (
    <GuestShell institution={home.data?.institution} pages={home.data?.pages ?? []}>
      <Button component={RouterLink} to="/visit" size="small" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 1.5 }}>All visitor information</Button>
      {error?.status === 404 ? <Alert severity="info">This page is not available.</Alert>
        : error ? <ErrorPanel error={error} onRetry={refetch} />
          : loading ? <Rows rows={4} /> : (
            <>
              <Typography variant="h4" component="h1" sx={{ mb: 0.5, overflowWrap: 'anywhere' }}>{data.title}</Typography>
              {data.summary && <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>{data.summary}</Typography>}
              {data.layoutError && <Alert severity="warning" sx={{ mb: 2 }}>{data.layoutError}</Alert>}
              <CmsPageRenderer layout={data.layout} publicView />
            </>
          )}
    </GuestShell>
  );
}

export default PublicLandingPage;

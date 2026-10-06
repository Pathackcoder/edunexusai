import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import HeadsetMicOutlinedIcon from '@mui/icons-material/HeadsetMicOutlined';
import { FaqAccordion } from '../components/faqs/FaqAccordion';
import { PageHeader } from '../components/common/PageHeader';
import { Section } from '../components/common/Section';
import { WidgetCard } from '../components/common/WidgetCard';
import { HelpDeskIllustration } from '../assets/illustrations/HelpDeskIllustration';
import { useApiQuery } from '../hooks/useApiQuery';
import { supportApi } from '../services/api';
import { DataState } from '../components/common/DataState';

const EMPTY_CONTACTS = {};

const ContactLine = ({ icon: Icon, children, color }) => (
  <Stack direction="row" alignItems="center" spacing={0.75}>
    <Icon sx={{ fontSize: 16, color: color ?? 'grey.400', flexShrink: 0 }} />
    <Typography variant="body2" sx={{ color: color ?? 'text.secondary', fontWeight: color ? 600 : 400, fontSize: '0.8125rem' }}>
      {children}
    </Typography>
  </Stack>
);

export const HelpSupportPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data, loading, error, refetch } = useApiQuery(() => supportApi.getHelp());
  const faqCategories = data?.categories ?? [];
  const faqData = data?.faqs ?? [];
  const supportContacts = data?.supportContacts ?? EMPTY_CONTACTS;

  const filteredFaqs = useMemo(() => {
    return faqData.filter(faq => {
      if (selectedCategory !== 'all' && faq.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        return faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q);
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading help content…"
      minHeight={320}
    >
      {() => (
        <Box>
          <PageHeader
            title="Help Desk & Student FAQs"
            description="Find answers to common questions about your student account, academic deadlines, billing, and campus resources."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Search hero */}
            <Card
              sx={(theme) => ({
                p: { xs: 2.5, sm: 3.5 },
                background: `linear-gradient(115deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${theme.palette.background.paper} 60%)`,
              })}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" spacing={3}>
                <Box sx={{ flex: 1, width: '100%', maxWidth: 640 }}>
                  <Typography variant="h4" component="h2">How can we help you today, Amit?</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                    Search over 15+ comprehensive articles on registration, transcripts, bursar billing, and campus safety.
                  </Typography>
                  <TextField
                    type="text"
                    placeholder="Search by topic, e.g., 'transcripts', 'pay balance', 'Canvas LMS', 'SafeWalk'..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="medium"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon sx={{ color: 'grey.400' }} />
                        </InputAdornment>
                      ),
                      endAdornment: searchQuery ? (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setSearchQuery('')} aria-label="Clear search query" size="small" edge="end">
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                    }}
                  />
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'block' }, width: 240, flexShrink: 0, ml: 'auto !important' }}>
                  <HelpDeskIllustration style={{ width: '100%', height: 'auto', display: 'block' }} />
                </Box>
              </Stack>
            </Card>

            {/* Category filter */}
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
              {faqCategories.map(cat => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <Chip
                    key={cat.id}
                    clickable
                    onClick={() => setSelectedCategory(cat.id)}
                    aria-pressed={isSelected}
                    label={cat.label}
                    variant={isSelected ? 'filled' : 'outlined'}
                    color={isSelected ? 'primary' : 'default'}
                    sx={{ height: 32, ...(isSelected ? {} : { borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper' }) }}
                  />
                );
              })}
            </Stack>

            {/* FAQ list */}
            <Section
              title={selectedCategory === 'all' ? 'All Frequently Asked Questions' : `${faqCategories.find(c => c.id === selectedCategory)?.label} Questions`}
              action={
                <Typography variant="caption">
                  Showing {filteredFaqs.length} {filteredFaqs.length === 1 ? 'result' : 'results'}
                </Typography>
              }
            >
              {filteredFaqs.length === 0 ? (
                <Card sx={{ py: 5, px: 2, textAlign: 'center' }}>
                  <HelpOutlineRoundedIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
                  <Typography variant="h6" component="h4">No articles found matching "{searchQuery}"</Typography>
                  <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
                    Try searching with broader terms or check the support contact channels below.
                  </Typography>
                </Card>
              ) : (
                <FaqAccordion items={filteredFaqs} />
              )}
            </Section>

            {/* Still need help */}
            <WidgetCard
              title="Still Need Help? Contact Campus Student Services"
              subtitle="Direct contact information for institutional administrative and technology support desks."
              icon={HeadsetMicOutlinedIcon}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                <Stack spacing={1} sx={{ p: 2, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3 }}>
                  <Typography variant="subtitle2">{supportContacts.studentServices.title}</Typography>
                  <ContactLine icon={PlaceOutlinedIcon}>{supportContacts.studentServices.office}</ContactLine>
                  <ContactLine icon={ScheduleRoundedIcon}>{supportContacts.studentServices.hours}</ContactLine>
                  <ContactLine icon={PhoneOutlinedIcon} color="primary.main">{supportContacts.studentServices.phone}</ContactLine>
                </Stack>

                <Stack spacing={1} sx={{ p: 2, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3 }}>
                  <Typography variant="subtitle2">{supportContacts.itHelpDesk.title}</Typography>
                  <ContactLine icon={PlaceOutlinedIcon}>{supportContacts.itHelpDesk.office}</ContactLine>
                  <ContactLine icon={ScheduleRoundedIcon}>{supportContacts.itHelpDesk.hours}</ContactLine>
                  <ContactLine icon={MailOutlineRoundedIcon} color="primary.main">{supportContacts.itHelpDesk.email}</ContactLine>
                </Stack>

                <Stack spacing={1} sx={(theme) => ({ p: 2, bgcolor: 'error.lighter', border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`, borderRadius: 3 })}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <GppMaybeOutlinedIcon sx={{ fontSize: 18, color: 'error.main' }} />
                    <Typography variant="subtitle2" sx={{ color: 'error.dark' }}>Campus Safety & Security</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'error.dark', fontSize: '0.8125rem' }}>
                    Emergency: <strong>911</strong><br />
                    Campus Dispatch: <strong>{supportContacts.campusSafety.dispatchPhone}</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'error.dark' }}>
                    Location: {supportContacts.campusSafety.office} (24/7)
                  </Typography>
                </Stack>
              </Box>
            </WidgetCard>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

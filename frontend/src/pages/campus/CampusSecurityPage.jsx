import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import { alpha } from '@mui/material/styles';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { EmergencyProcedureCard } from '../../components/security/EmergencyProcedureCard';
import { SafeWalkModal } from '../../components/security/SafeWalkModal';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { useApiQuery } from '../../hooks/useApiQuery';
import { campusApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

export const CampusSecurityPage = () => {
  const [isSafeWalkOpen, setIsSafeWalkOpen] = useState(false);
  const { data, loading, error, refetch } = useApiQuery(() => campusApi.getSafety());

  // The original module attached dispatch numbers as extra properties on the contacts
  // array. Those are now a keyed settings group, re-attached here so the markup below
  // keeps reading `campusSecurityContacts.dispatch` and friends.
  const campusSecurityContacts = Object.assign([...(data?.contacts ?? [])], data?.dispatch ?? {});
  const emergencyProcedures = data?.procedures ?? [];
  const safeWalkInfo = data?.safeWalk ?? {};

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading campus safety information…"
      minHeight={320}
    >
      {() => (
        <Box>
          <PageHeader
            title="Campus Safety & Emergency Services"
            description="24/7 university safety dispatch, SafeWalk night escort services, and emergency protocols."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Emergency hotline */}
            <Card
              sx={(theme) => ({
                p: { xs: 2.5, sm: 3 },
                bgcolor: 'error.lighter',
                borderColor: alpha(theme.palette.error.main, 0.22),
                boxShadow: `0 6px 20px -8px ${alpha(theme.palette.error.main, 0.25)}`,
              })}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={2.5}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ width: 52, height: 52, borderRadius: '50%', bgcolor: 'background.paper', color: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 1 }}>
                    <GppMaybeOutlinedIcon />
                  </Box>
                  <Box>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
                      <Typography variant="h5" component="h2" sx={{ color: 'error.dark', fontWeight: 600 }}>
                        Campus Emergency Dispatch: (555) 019-SAFE
                      </Typography>
                      <Badge variant="danger">24/7 Monitored</Badge>
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'error.dark', opacity: 0.9, mt: 0.5 }}>
                      For active threats or medical life-threatening emergencies, immediately dial <strong>911</strong>.
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ flexShrink: 0 }}>
                  <Button variant="danger" size="md" icon={PhoneInTalkOutlinedIcon} onClick={() => window.open('tel:911')}>
                    Call 911 Direct
                  </Button>
                  <Button variant="outline" size="md" icon={VerifiedUserOutlinedIcon} onClick={() => setIsSafeWalkOpen(true)}>
                    Request SafeWalk Escort
                  </Button>
                </Stack>
              </Stack>
            </Card>

            {/* Contact cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 2 }}>
              {(Array.isArray(campusSecurityContacts) ? campusSecurityContacts : []).map((contact, idx) => (
                <Card
                  key={contact.phone || idx}
                  sx={(theme) => ({
                    p: 2.25,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    ...(contact.isPrimary && { borderColor: alpha(theme.palette.error.main, 0.3) }),
                  })}
                >
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{contact.title}</Typography>
                      <Badge variant={contact.isPrimary ? 'danger' : 'neutral'}>{contact.available}</Badge>
                    </Stack>
                    <Typography variant="caption" component="p" sx={{ mt: 0.75, color: 'text.secondary' }}>
                      {contact.description}
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 'auto', pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
                    <Link
                      href={`tel:${contact.phone.replace(/[^0-9]/g, '')}`}
                      underline="none"
                      sx={{
                        typography: 'body2',
                        fontWeight: 600,
                        color: contact.isPrimary ? 'error.main' : 'primary.main',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      <PhoneOutlinedIcon sx={{ fontSize: 16 }} />
                      {contact.phone}
                    </Link>
                  </Box>
                </Card>
              ))}
            </Box>

            {/* Emergency action guides */}
            <Section
              title="Emergency Action Guides & Protocols"
              description="Standard operating safety instructions for campus buildings and residence halls."
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
                {emergencyProcedures.map(proc => (
                  <EmergencyProcedureCard key={proc.id} procedure={proc} />
                ))}
              </Box>
            </Section>
          </Stack>

          {/* SafeWalk Escort Request Modal */}
          <SafeWalkModal
            safeWalkInfo={safeWalkInfo}
            isOpen={isSafeWalkOpen}
            onClose={() => setIsSafeWalkOpen(false)}
          />
        </Box>
      )}
    </DataState>
  );
};

export default CampusSecurityPage;

import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ContactEmergencyOutlinedIcon from '@mui/icons-material/ContactEmergencyOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { IconTile } from '../components/common/IconTile';
import { PageHeader } from '../components/common/PageHeader';
import { Section } from '../components/common/Section';
import { WidgetCard } from '../components/common/WidgetCard';
import { useApiQuery } from '../hooks/useApiQuery';
import { profileApi } from '../services/api';

export const ProfilePage = () => {
  const { user } = useAuth();
  // The signed-in user already carries the profile fields, so this page only needs the
  // outstanding petitions. A failure here just hides the pending badges.
  const { data } = useApiQuery(() => profileApi.getRequests());
  const profile = user ?? {};
  const addressRequests = data?.addressRequests ?? [];
  const nameRequests = data?.nameRequests ?? [];

  const isPending = (request) => request.status === 'Pending' || request.status === 'In Review';
  const pendingAddress = addressRequests.find(isPending);
  const pendingName = nameRequests.find(isPending);

  const initials = `${(user?.firstName ?? '').charAt(0)}${(user?.lastName ?? '').charAt(0)}`.toUpperCase() || '—';

  const sections = [
    {
      title: 'Personal Information',
      description: 'Update your contact phone, personal email, mailing address, or file a legal name change petition.',
      icon: PersonOutlineRoundedIcon,
      tone: 'primary',
      actionText: 'Manage & Request Changes',
      path: '/profile/personal',
      badge: 'Official Records'
    },
    {
      title: 'Emergency Contact',
      description: 'Manage primary and secondary emergency contact names, relationships, and 24/7 telephone numbers.',
      icon: ContactEmergencyOutlinedIcon,
      tone: 'danger',
      actionText: 'Edit Contact Details',
      path: '/profile/emergency',
      badge: 'Safety Critical'
    },
    {
      title: 'Pronouns & Privacy',
      description: 'Select preferred pronouns, configure visibility on faculty class rosters, and control directory visibility.',
      icon: BadgeOutlinedIcon,
      tone: 'purple',
      actionText: 'Manage Privacy',
      path: '/profile/privacy',
      badge: 'Identity'
    },
    {
      title: 'Communication Preferences',
      description: 'Configure delivery channels (Email, SMS text, Push alerts) for academic, financial, and event updates.',
      icon: NotificationsNoneRoundedIcon,
      tone: 'info',
      actionText: 'Manage Preferences',
      path: '/profile/preferences',
      badge: 'Notifications'
    },
    {
      title: 'Requests & Changes',
      description: 'Track the real-time review status of submitted address and legal name change petitions.',
      icon: HistoryRoundedIcon,
      tone: 'warning',
      actionText: 'View Request Status',
      path: '/profile/requests',
      badge: 'Tracking'
    }
  ];

  const statusItems = [
    {
      title: 'Address Change',
      meta: pendingAddress ? `Ref: ${pendingAddress.id}` : 'Approved (Fall 2025)',
      badge: <Badge variant={pendingAddress ? 'warning' : 'success'}>{pendingAddress ? 'Pending Review' : 'Verified'}</Badge>,
    },
    {
      title: 'Legal Name Change',
      meta: pendingName ? `Petition: ${pendingName.id}` : 'No active petition',
      badge: <Badge variant={pendingName ? 'warning' : 'neutral'}>{pendingName ? 'Pending Review' : 'Current'}</Badge>,
    },
    { title: 'Emergency Contact', meta: 'Primary: Rajesh Pathak', badge: <Badge variant="success">Updated</Badge> },
    { title: 'Communication Channels', meta: 'SMS & Email Active', badge: <Badge variant="success">Updated</Badge> },
  ];

  return (
    <Box>
      <PageHeader
        title="My Profile"
        description={`Student information and personal management hub for ${user?.fullName ?? 'your account'}.`}
      />

      <Stack spacing={{ xs: 3, md: 3.5 }}>
        {/* Identity card */}
        <Card
          sx={(theme) => ({
            p: { xs: 2.5, sm: 3 },
            background: `linear-gradient(115deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${theme.palette.background.paper} 55%)`,
          })}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={2.5} sx={{ minWidth: 0 }}>
              <Avatar sx={{ width: 72, height: 72, fontSize: '1.625rem', bgcolor: 'primary.main', boxShadow: `0 6px 16px -6px rgba(70, 81, 222, 0.6)` }}>
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1.25}>
                  <Typography variant="h3" component="h2" sx={{ fontSize: { xs: '1.375rem', sm: '1.625rem' } }}>
                    {profile.fullName ?? '—'}
                  </Typography>
                  <Badge variant="success" dot>Active Student</Badge>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {profile.degree} • {profile.department}
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2.5} sx={{ mt: 1.25 }}>
                  <Typography variant="caption">
                    Student ID: <Box component="strong" sx={{ color: 'text.primary' }}>{profile.studentNumber ?? profile.employeeNumber ?? "—"}</Box>
                  </Typography>
                  <Typography variant="caption">
                    Admit Term: <Box component="strong" sx={{ color: 'text.primary' }}>{profile.admitTerm}</Box>
                  </Typography>
                  <Typography variant="caption">
                    Institution: <Box component="strong" sx={{ color: 'text.primary' }}>{profile.institution}</Box>
                  </Typography>
                </Stack>
              </Box>
            </Stack>

            <Box sx={{ px: 2.25, py: 1.5, bgcolor: 'background.paper', borderRadius: 3, border: 1, borderColor: 'divider', textAlign: { md: 'right' }, flexShrink: 0 }}>
              <Typography variant="caption">Academic Standing</Typography>
              <Typography variant="subtitle1" sx={{ color: 'success.main', fontWeight: 600 }}>{profile.academicStanding}</Typography>
            </Box>
          </Stack>
        </Card>

        {/* Self-service workflows */}
        <Section title="Manage Profile & Self-Service Workflows">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {sections.map(section => (
              <Card key={section.title} sx={{ display: 'flex', '&:hover': { boxShadow: 3, borderColor: 'grey.300' } }}>
                <CardActionArea component={RouterLink} to={section.path} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between', gap: 2 }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <IconTile icon={section.icon} tone={section.tone} size={40} />
                      <Badge variant="neutral">{section.badge}</Badge>
                    </Stack>
                    <Typography variant="h6" component="h4">{section.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{section.description}</Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider', color: 'primary.main' }}>
                    <Typography variant="body2" fontWeight={600} color="primary.main">{section.actionText}</Typography>
                    <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
                  </Stack>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Section>

        {/* Recent requests */}
        <WidgetCard
          title="Recent Requests & Institutional Changes"
          subtitle="Real-time audit log of student profile update petitions and preferences."
          icon={HistoryRoundedIcon}
          tone="warning"
          headerAction={
            <Button component={RouterLink} to="/profile/requests" size="small" endIcon={<ArrowForwardRoundedIcon />} sx={{ color: 'primary.main' }}>
              View All History
            </Button>
          }
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
            {statusItems.map((item) => (
              <Stack
                key={item.title}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ px: 1.75, py: 1.5, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 2.5 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                  <Typography variant="caption" noWrap component="div">{item.meta}</Typography>
                </Box>
                {item.badge}
              </Stack>
            ))}
          </Box>
        </WidgetCard>
      </Stack>
    </Box>
  );
};

export default ProfilePage;

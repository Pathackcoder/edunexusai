import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalLibraryOutlinedIcon from '@mui/icons-material/LocalLibraryOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Badge } from '../components/common/Badge';
import { IconTile } from '../components/common/IconTile';
import { PageHeader } from '../components/common/PageHeader';
import { useApiQuery } from '../hooks/useApiQuery';
import { libraryApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

const EMPTY_SUMMARY = {};

/** One campus service: icon, title, description, a key fact strip and a call to action. */
const ServiceCard = ({ icon, tone, title, badge, description, fact, factSx, action }) => (
  <Card sx={{ p: { xs: 2.5, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.25, height: '100%', '&:hover': { boxShadow: 3 } }}>
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
      <IconTile icon={icon} tone={tone} size={46} />
      {badge}
    </Stack>
    <Box>
      <Typography variant="h5" component="h3">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{description}</Typography>
    </Box>
    <Box sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', typography: 'caption', color: 'text.secondary', ...factSx }}>
      {fact}
    </Box>
    <Box sx={{ mt: 'auto' }}>{action}</Box>
  </Card>
);

export const CampusPage = () => {
  const { isStudent } = useAuth();
  // The library teaser is student-only; faculty and admin accounts have no patron record,
  // so the call is skipped rather than allowed to 403.
  const { data } = useApiQuery(() => libraryApi.get(), [isStudent], { enabled: isStudent });
  const libraryAccountSummary = data?.summary ?? EMPTY_SUMMARY;
  const initialCheckedOutBooks = data?.loans ?? [];

  return (
    <Box>
      <PageHeader
        title="Campus Life & Student Services"
        description="University community directory, main research library facilities, and 24/7 campus safety dispatch."
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 2, md: 2.5 } }}>
        {/* People Search */}
        <ServiceCard
          icon={GroupsOutlinedIcon}
          tone="primary"
          title="People Search"
          description="Locate undergraduate and graduate peers, academic advisors, tenured faculty, and university department staff members."
          fact="Search-first directory across 8 academic departments and administrative offices."
          action={
            <Button component={RouterLink} to="/campus/people" variant="contained" fullWidth endIcon={<ArrowForwardRoundedIcon />}>
              Search University Directory
            </Button>
          }
        />

        {/* Library Account */}
        <ServiceCard
          icon={LocalLibraryOutlinedIcon}
          tone="info"
          title="University Library"
          badge={<Badge variant="purple">{initialCheckedOutBooks.length} Active Loans</Badge>}
          description="Manage borrowed textbooks and journals, request 14-day loan renewals, and discover electronic database resources."
          fact={
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <span>Overdue: <Box component="strong" sx={{ color: 'text.primary' }}>0 items</Box></span>
              <span>Outstanding Fines: <Box component="strong" sx={{ color: 'success.main' }}>$0.00</Box></span>
            </Stack>
          }
          action={
            <Button component={RouterLink} to="/campus/library" variant="outlined" color="inherit" fullWidth endIcon={<ArrowForwardRoundedIcon />}>
              Manage Library Account
            </Button>
          }
        />

        {/* Campus Security */}
        <ServiceCard
          icon={HealthAndSafetyOutlinedIcon}
          tone="danger"
          title="Campus Safety & Security"
          badge={<Badge variant="danger">24/7 Dispatch</Badge>}
          description="24/7 emergency dispatch hotline, evening SafeWalk campus safety escorts, and building emergency action procedures."
          fact={
            <>
              Emergency Dispatch: <strong>(555) 019-SAFE</strong> • Direct: <strong>911</strong>
            </>
          }
          factSx={{ bgcolor: 'error.lighter', borderColor: 'rgba(208, 58, 58, 0.2)', color: 'error.dark' }}
          action={
            <Button
              component={RouterLink}
              to="/campus/security"
              variant="outlined"
              color="error"
              fullWidth
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ bgcolor: 'background.paper', borderColor: 'rgba(208, 58, 58, 0.35)', '&:hover': { bgcolor: 'error.lighter', borderColor: 'error.main' } }}
            >
              Safety Services & Protocols
            </Button>
          }
        />
      </Box>
    </Box>
  );
};

export default CampusPage;

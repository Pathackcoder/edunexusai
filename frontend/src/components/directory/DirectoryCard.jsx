import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { Badge } from '../common/Badge';

export const DirectoryCard = ({ person, onSelect }) => {
  const getBadgeVariant = (type) => {
    switch (type) {
      case 'faculty':
        return 'purple';
      case 'staff':
        return 'warning';
      default:
        return 'primary';
    }
  };

  const getRoleIcon = (type) => {
    switch (type) {
      case 'faculty':
        return <WorkspacePremiumOutlinedIcon sx={{ fontSize: 15, color: 'secondary.main' }} />;
      case 'staff':
        return <WorkOutlineRoundedIcon sx={{ fontSize: 15, color: 'warning.main' }} />;
      default:
        return <SchoolOutlinedIcon sx={{ fontSize: 15, color: 'primary.main' }} />;
    }
  };

  const contactRow = (Icon, content) => (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
      <Icon sx={{ fontSize: 15, color: 'grey.400', flexShrink: 0 }} />
      {content}
    </Stack>
  );

  return (
    <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.75, height: '100%', '&:hover': { borderColor: 'grey.300', boxShadow: 3 } }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Avatar aria-hidden="true" sx={{ width: 46, height: 46, bgcolor: person.avatarBg || 'primary.main', fontSize: '1rem', fontWeight: 600 }}>
            {person.initials}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h3" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {person.name}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
              {getRoleIcon(person.type)}
              <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{person.type}</Typography>
            </Stack>
          </Box>
        </Stack>
        <Badge variant={getBadgeVariant(person.type)}>{person.type.toUpperCase()}</Badge>
      </Stack>

      <Box>
        <Typography variant="body2" fontWeight={600}>{person.role}</Typography>
        <Typography variant="caption">{person.department}</Typography>
      </Box>

      <Stack spacing={0.75} sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {contactRow(
          MailOutlineRoundedIcon,
          <Link href={`mailto:${person.email}`} underline="hover" variant="caption" noWrap sx={{ color: 'primary.main', fontWeight: 500 }}>
            {person.email}
          </Link>,
        )}
        {person.phone && contactRow(PhoneOutlinedIcon, <Typography variant="caption">{person.phone}</Typography>)}
        {person.location && contactRow(PlaceOutlinedIcon, <Typography variant="caption" noWrap>{person.location}</Typography>)}
      </Stack>

      <Box sx={{ mt: 'auto', pt: 0.5 }}>
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          size="small"
          endIcon={<OpenInNewRoundedIcon />}
          onClick={() => onSelect(person)}
          aria-label={`View full profile for ${person.name}`}
        >
          View Profile
        </Button>
      </Box>
    </Card>
  );
};

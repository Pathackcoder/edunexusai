import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import ButtonBase from '@mui/material/ButtonBase';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { MetricLabel } from '../common/Section';
import { useToast } from '../common/Toast';

const ContactRow = ({ icon: Icon, label, children, divider, alignTop }) => (
  <Stack
    direction="row"
    alignItems={alignTop ? 'flex-start' : 'center'}
    justifyContent="space-between"
    spacing={2}
    sx={divider ? { borderTop: 1, borderColor: 'divider', pt: 1.25 } : undefined}
  >
    <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary', flexShrink: 0 }}>
      <Icon sx={{ fontSize: 17, color: 'grey.400' }} />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Stack>
    {children}
  </Stack>
);

export const PersonProfileModal = ({ person, isOpen, onClose }) => {
  const { showToast } = useToast();

  if (!person) return null;

  const handleCopy = (text, label) => {
    navigator.clipboard?.writeText(text);
    showToast(`${label} copied to clipboard`);
  };

  const copyButtonSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    typography: 'body2',
    fontWeight: 600,
    borderRadius: 1.5,
    px: 0.5,
    '&:hover': { textDecoration: 'underline' },
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="University Directory Profile"
      subtitle={`${person.department} • Demo University`}
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={MailOutlineRoundedIcon}
            onClick={() => {
              window.location.href = `mailto:${person.email}`;
            }}
          >
            Compose Email
          </Button>
        </>
      }
    >
      <Stack spacing={2.5}>
        {/* Identity */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: person.avatarBg || 'primary.main', fontSize: '1.375rem', fontWeight: 600 }}>
            {person.initials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
              <Typography variant="h4" component="h3">{person.name}</Typography>
              <Badge variant={person.type === 'faculty' ? 'purple' : person.type === 'staff' ? 'warning' : 'primary'}>
                {person.type.toUpperCase()}
              </Badge>
            </Stack>
            <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mt: 0.25 }}>{person.role}</Typography>
            <Typography variant="caption">{person.program} • {person.admitYear}</Typography>
          </Box>
        </Stack>

        {/* Bio */}
        {person.bio && (
          <Box>
            <MetricLabel>Overview & Academic Focus</MetricLabel>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{person.bio}</Typography>
          </Box>
        )}

        {/* Contact & location */}
        <Stack spacing={1.25} sx={{ bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2 }}>
          <ContactRow icon={MailOutlineRoundedIcon} label="Email:">
            <ButtonBase onClick={() => handleCopy(person.email, 'Email address')} sx={{ ...copyButtonSx, color: 'primary.main', minWidth: 0 }}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.email}</Box>
              <ContentCopyRoundedIcon sx={{ fontSize: 14, color: 'grey.400' }} />
            </ButtonBase>
          </ContactRow>
          <ContactRow icon={PhoneOutlinedIcon} label="Telephone:">
            <ButtonBase onClick={() => handleCopy(person.phone, 'Phone number')} sx={{ ...copyButtonSx, color: 'text.primary' }}>
              <span>{person.phone}</span>
              <ContentCopyRoundedIcon sx={{ fontSize: 14, color: 'grey.400' }} />
            </ButtonBase>
          </ContactRow>
          <ContactRow icon={PlaceOutlinedIcon} label="Campus Location:">
            <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right' }}>{person.location}</Typography>
          </ContactRow>
          {person.officeHours && (
            <ContactRow icon={ScheduleRoundedIcon} label="Office Hours:" divider alignTop>
              <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right', maxWidth: '60%' }}>{person.officeHours}</Typography>
            </ContactRow>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
};

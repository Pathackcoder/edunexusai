import React, { useRef } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MuiButton from '@mui/material/Button';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { DetailDrawer, DrawerSection, DetailList, DetailRow } from '../common/DetailDrawer';
import { heroChipSx } from '../dashboard/HeroBanner';
import { useToast } from '../common/Toast';

const TYPE_LABEL = { student: 'Student', faculty: 'Faculty', staff: 'Staff' };

/**
 * Directory profile in a right-hand drawer. Shows only what the directory record holds
 * (GET /directory): identity, role, department, programme or focus area, tenure,
 * contact details, office hours and bio.
 */
export const PersonProfileDrawer = ({ person, open, onClose }) => {
  const { showToast } = useToast();
  // Keep the last person while the drawer animates closed.
  const last = useRef(person);
  if (person) last.current = person;
  const p = last.current;
  if (!p) return null;

  const isStudent = p.type === 'student';
  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    showToast(`${label} copied to clipboard`);
  };
  const copyButton = (text, label) => (
    <Tooltip title={`Copy ${label.toLowerCase()}`}>
      <IconButton size="small" onClick={() => copy(text, label)} aria-label={`Copy ${label.toLowerCase()}`} sx={{ ml: 0.5, mt: -0.5 }}>
        <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
  // Students carry an admission year ("2025"); faculty and staff a tenure line ("Faculty since 2021").
  const tenure = /^\d{4}$/.test(String(p.admitYear ?? '')) ? `Admitted ${p.admitYear}` : p.admitYear;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      labelId="person-profile-title"
      header={
        <Stack direction="row" spacing={2} alignItems="center" sx={{ pr: 4 }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: p.avatarBg || 'primary.main', fontSize: '1.375rem', fontWeight: 600, color: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.16)' }}>
            {p.initials}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography id="person-profile-title" variant="h4" component="h2" sx={{ color: '#fff' }}>{p.name}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{p.role}</Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mt: 1 }}>
              <Chip size="small" label={TYPE_LABEL[p.type] ?? p.type} sx={heroChipSx} />
              {p.department && <Chip size="small" icon={<ApartmentOutlinedIcon />} label={p.department} sx={{ ...heroChipSx, maxWidth: '100%' }} />}
            </Stack>
          </Box>
        </Stack>
      }
      footer={
        <>
          {p.phone && (
            <MuiButton variant="outlined" startIcon={<PhoneOutlinedIcon />} href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
              Call
            </MuiButton>
          )}
          <MuiButton variant="contained" startIcon={<MailOutlineRoundedIcon />} href={`mailto:${p.email}`}>
            Email {p.name.split(' ')[p.name.startsWith('Dr.') ? 1 : 0]}
          </MuiButton>
        </>
      }
    >
      {p.bio && (
        <DrawerSection title={isStudent ? 'About' : 'Overview & focus'}>
          <Typography variant="body2" color="text.secondary">{p.bio}</Typography>
        </DrawerSection>
      )}

      <DrawerSection title={isStudent ? 'Academic information' : 'Professional information'}>
        <DetailList>
          <DetailRow icon={BadgeOutlinedIcon} label="Role">{p.role}</DetailRow>
          {p.department && <DetailRow icon={ApartmentOutlinedIcon} label="Department">{p.department}</DetailRow>}
          {p.program && (
            <DetailRow icon={isStudent ? SchoolOutlinedIcon : ScienceOutlinedIcon} label={isStudent ? 'Program' : 'Focus area'}>
              {p.program}
            </DetailRow>
          )}
          {tenure && <DetailRow icon={EventOutlinedIcon} label={isStudent ? 'Admission' : 'Tenure'}>{tenure}</DetailRow>}
        </DetailList>
      </DrawerSection>

      <DrawerSection title="Contact">
        <DetailList>
          <DetailRow icon={MailOutlineRoundedIcon} label="Email">
            <Stack direction="row" alignItems="flex-start">
              <Box component="a" href={`mailto:${p.email}`} sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{p.email}</Box>
              {copyButton(p.email, 'Email address')}
            </Stack>
          </DetailRow>
          {p.phone && (
            <DetailRow icon={PhoneOutlinedIcon} label="Telephone">
              <Stack direction="row" alignItems="flex-start">
                <span>{p.phone}</span>
                {copyButton(p.phone, 'Phone number')}
              </Stack>
            </DetailRow>
          )}
          {p.location && <DetailRow icon={PlaceOutlinedIcon} label="Campus location">{p.location}</DetailRow>}
          {p.officeHours && <DetailRow icon={ScheduleRoundedIcon} label={isStudent ? 'Availability' : 'Office hours'}>{p.officeHours}</DetailRow>}
        </DetailList>
      </DrawerSection>
    </DetailDrawer>
  );
};

export default PersonProfileDrawer;

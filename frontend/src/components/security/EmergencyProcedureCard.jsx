import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import ThunderstormOutlinedIcon from '@mui/icons-material/ThunderstormOutlined';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { MetricLabel } from '../common/Section';

export const EmergencyProcedureCard = ({ procedure }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getProcedureIcon = (iconName) => {
    switch (iconName) {
      case 'Flame':
        return LocalFireDepartmentOutlinedIcon;
      case 'CloudLightning':
        return ThunderstormOutlinedIcon;
      case 'ShieldAlert':
        return GppMaybeOutlinedIcon;
      default:
        return MonitorHeartOutlinedIcon;
    }
  };

  const Icon = getProcedureIcon(procedure.icon);

  return (
    <Card sx={{ position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: procedure.urgencyColor, zIndex: 1 } }}>
      <ButtonBase
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        sx={{
          width: '100%',
          p: 2,
          pl: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          textAlign: 'left',
          bgcolor: isOpen ? 'background.subtle' : 'transparent',
          transition: 'background-color 160ms ease',
          '&:hover': { bgcolor: 'background.subtle' },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: `${procedure.urgencyColor}15`,
              color: procedure.urgencyColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 21 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{procedure.title}</Typography>
            <Typography variant="caption">{procedure.summary}</Typography>
          </Box>
        </Stack>
        <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: 'grey.500', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
      </ButtonBase>

      <Collapse in={isOpen} timeout={220} unmountOnExit>
        <Box sx={{ p: 2, pl: 2.5, borderTop: 1, borderColor: 'divider' }}>
          <MetricLabel>Emergency Protocol Steps</MetricLabel>
          <Stack component="ol" spacing={1} sx={{ mt: 1.25, mb: 0, pl: 0, listStyle: 'none', counterReset: 'step' }}>
            {procedure.steps.map((step, idx) => (
              <Stack component="li" key={idx} direction="row" spacing={1.25} alignItems="flex-start">
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: 'grey.100',
                    color: 'text.secondary',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    mt: 0.125,
                  }}
                >
                  {idx + 1}
                </Box>
                <Typography variant="body2" color="text.secondary">{step}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Card>
  );
};

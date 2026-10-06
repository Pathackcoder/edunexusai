import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Badge } from '../common/Badge';

export const AidAwardCard = ({ award }) => {
  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="overline" sx={{ color: 'secondary.main', lineHeight: 1.5 }}>
          {award.category}
        </Typography>
        <Badge variant="success" dot>{award.status}</Badge>
      </Stack>

      <Box>
        <Typography variant="h6" component="h4" sx={{ lineHeight: 1.35 }}>
          {award.name}
        </Typography>
        <Typography variant="caption">Term: {award.term}</Typography>
      </Box>

      <Typography variant="metric" component="div" sx={{ fontSize: '1.625rem', color: 'primary.main' }}>
        {award.formattedAmount}
      </Typography>

      <Typography variant="body2" color="text.secondary">
        {award.description}
      </Typography>

      {award.renewable && (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 'auto', pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'info.main' }} />
          <Typography variant="caption">
            Renewability: <Box component="strong" sx={{ color: 'text.primary' }}>{award.renewable}</Box>
          </Typography>
        </Stack>
      )}
    </Card>
  );
};

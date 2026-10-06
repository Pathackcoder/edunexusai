import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const LibraryBookCard = ({ book, onRenew }) => {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Due Soon':
        return <Badge variant="warning" dot>Due Soon</Badge>;
      case 'Renewed':
        return <Badge variant="purple" dot>Renewed</Badge>;
      default:
        return <Badge variant="success" dot>Active Loan</Badge>;
    }
  };

  return (
    <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.75, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
        <Stack direction="row" alignItems="flex-start" spacing={1.75} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 42,
              height: 56,
              borderRadius: 1.5,
              bgcolor: book.coverColor || 'primary.main',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: 'inset -3px 0 0 rgba(0,0,0,0.12), 0 2px 6px rgba(18,24,51,0.12)',
            }}
          >
            <MenuBookRoundedIcon sx={{ fontSize: 20, opacity: 0.9 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{book.title}</Typography>
            <Typography variant="caption">By {book.author}</Typography>
          </Box>
        </Stack>
        {getStatusBadge(book.status)}
      </Stack>

      <Stack spacing={0.5}>
        <Typography variant="caption">
          Call Number:{' '}
          <Box component="strong" sx={{ color: 'text.primary', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{book.callNumber}</Box>
        </Typography>
        <Typography variant="caption">
          Location: <Box component="span" sx={{ color: 'text.secondary' }}>{book.location}</Box>
        </Typography>
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap" spacing={1.25} sx={{ mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <ScheduleRoundedIcon sx={{ fontSize: 16, color: 'grey.400' }} />
          <Typography variant="body2" color="text.secondary">Due:</Typography>
          <Typography variant="body2" fontWeight={600} sx={{ color: book.status === 'Due Soon' ? 'warning.main' : 'text.primary' }}>
            {book.dueDate}
          </Typography>
          {book.renewalsCount > 0 && (
            <Typography variant="caption">({book.renewalsCount}x renewed)</Typography>
          )}
        </Stack>
        <Button
          size="sm"
          variant={book.status === 'Due Soon' ? 'primary' : 'outline'}
          icon={AutorenewRoundedIcon}
          onClick={() => onRenew(book.id)}
        >
          Renew Loan
        </Button>
      </Stack>
    </Card>
  );
};

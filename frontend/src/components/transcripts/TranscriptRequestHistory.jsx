import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Button from '@mui/material/Button';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { Badge } from '../common/Badge';
import { IconTile } from '../common/IconTile';
import { EmptyState } from '../common/EmptyState';

export const TranscriptRequestHistory = ({ requests }) => {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Delivered':
      case 'Completed':
        return <Badge variant="success" dot>{status}</Badge>;
      case 'Processing':
        return <Badge variant="warning" dot>Processing</Badge>;
      default:
        return <Badge variant="primary">{status}</Badge>;
    }
  };

  const downloadReceipt = (req) => alert(`Downloading Order Receipt for ${req.id}...`);

  return (
    <Card>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <IconTile icon={HistoryRoundedIcon} tone="purple" size={34} />
        <Box>
          <Typography variant="h6" component="h3">Official Transcript Order History</Typography>
          <Typography variant="caption">
            Track the fulfillment and electronic dispatch status of your certified academic record requests.
          </Typography>
        </Box>
      </Stack>

      {requests.length === 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <EmptyState compact title="No transcript orders yet" description="Official transcript requests you submit will be tracked here." />
        </Box>
      )}

      {/* Desktop table */}
      {requests.length > 0 && (
        <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
          <Table sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Order ID / Date</TableCell>
                <TableCell>Delivery Format</TableCell>
                <TableCell>Recipient Destination</TableCell>
                <TableCell>Copies</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map(req => (
                <TableRow key={req.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="primary.main">{req.id}</Typography>
                    <Typography variant="caption">{req.requestDate}</Typography>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{req.deliveryType}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{req.recipient}</Typography>
                    <Typography variant="caption">{req.recipientEmail}</Typography>
                  </TableCell>
                  <TableCell>{req.copies}</TableCell>
                  <TableCell>{getStatusBadge(req.status)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadReceipt(req)} sx={{ color: 'primary.main' }}>
                      PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Mobile stacked view */}
      {requests.length > 0 && (
        <Stack spacing={1} sx={{ display: { xs: 'flex', sm: 'none' }, px: 2, pb: 2 }}>
          {requests.map(req => (
            <Box key={req.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Box>
                  <Typography variant="body2" fontWeight={700} color="primary.main">{req.id}</Typography>
                  <Typography variant="caption">{req.requestDate}</Typography>
                </Box>
                {getStatusBadge(req.status)}
              </Stack>
              <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>To: {req.recipient}</Typography>
              <Typography variant="caption">
                {req.deliveryType} • {req.copies} {req.copies === 1 ? 'copy' : 'copies'}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>{req.fee}</Typography>
                <Button size="small" variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadReceipt(req)}>
                  Receipt
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Card>
  );
};

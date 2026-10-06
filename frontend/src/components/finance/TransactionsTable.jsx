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
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Badge } from '../common/Badge';
import { IconTile } from '../common/IconTile';
import { EmptyState } from '../common/EmptyState';
import { useAuth } from '../../context/AuthContext';

export const TransactionsTable = ({ transactions }) => {
  const { user } = useAuth();
  const downloadReceipt = (tx) => alert(`Downloading Receipt #${tx.receiptNumber} for ${user?.fullName ?? 'this account'}...`);

  return (
    <Card>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <IconTile icon={ReceiptLongOutlinedIcon} tone="primary" size={34} />
        <Box>
          <Typography variant="h6" component="h2">Transaction History</Typography>
          <Typography variant="caption">Payments posted to your student account</Typography>
        </Box>
      </Stack>

      {transactions.length === 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <EmptyState compact title="No transactions yet" description="Payments you make will appear here with a downloadable receipt." />
        </Box>
      )}

      {/* Desktop / tablet table */}
      {transactions.length > 0 && (
        <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
          <Table sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>Receipt / Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Method</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{tx.receiptNumber}</Typography>
                    <Typography variant="caption">{tx.date}</Typography>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{tx.description}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{tx.paymentMethod}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    ${Number(tx.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" dot>{tx.status}</Badge>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadReceipt(tx)} sx={{ color: 'primary.main' }}>
                      PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Mobile stacked receipts */}
      {transactions.length > 0 && (
        <Stack spacing={1} sx={{ display: { xs: 'flex', sm: 'none' }, px: 2, pb: 2 }}>
          {transactions.map((tx) => (
            <Box key={tx.id} sx={{ p: 1.5, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>Receipt #{tx.receiptNumber}</Typography>
                  <Typography variant="caption">{tx.date}</Typography>
                </Box>
                <Badge variant="success" dot>{tx.status}</Badge>
              </Stack>
              <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary' }}>
                {tx.description} • {tx.paymentMethod}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>${Number(tx.amount).toFixed(2)} USD</Typography>
                <Button size="small" variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadReceipt(tx)}>
                  PDF
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Card>
  );
};

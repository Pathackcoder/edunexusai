import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import { LibraryBookCard } from '../../components/library/LibraryBookCard';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { StatCard } from '../../components/common/StatCard';
import { IconTile } from '../../components/common/IconTile';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { libraryApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const EMPTY_SUMMARY = {};

export const LibraryPage = () => {
  const [catalogQuery, setCatalogQuery] = useState('');
  const { showToast } = useToast();

  const { data, loading, error, refetch } = useApiQuery(() => libraryApi.get());
  const libraryAccountSummary = data?.summary ?? EMPTY_SUMMARY;
  const checkedOutBooks = data?.loans ?? [];
  const sampleLibraryCatalog = data?.catalog ?? [];

  // Renewing is a server write: the new due date and the renewal count come back from
  // the circulation record rather than being computed in the browser.
  const handleRenewBook = async (bookId) => {
    const loan = checkedOutBooks.find((book) => book.id === bookId);
    if (!loan) return;
    try {
      const renewed = await libraryApi.renewLoan(loan.loanId);
      showToast(`"${renewed.title}" renewed! New due date: ${renewed.dueDate}`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'This item could not be renewed.');
    }
  };

  const filteredCatalog = useMemo(() => {
    if (!catalogQuery.trim()) return sampleLibraryCatalog;
    const q = catalogQuery.toLowerCase().trim();
    return sampleLibraryCatalog.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.author?.toLowerCase().includes(q) ||
        item.callNumber?.toLowerCase().includes(q),
    );
  }, [catalogQuery, sampleLibraryCatalog]);

  const kpiValue = { fontSize: { xs: '1.25rem', md: '1.5rem' } };

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your library account…"
      minHeight={320}
    >
      {() => (
        <Box>
          <PageHeader
            title="University Library Account"
            description="Manage checked-out volumes, request 14-day loan renewals, and search the university research catalog."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Library KPI Summary */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2 } }}>
              <StatCard
                title="Active Loans"
                value={<Box component="span" sx={{ color: 'primary.main' }}>{checkedOutBooks.length} Items</Box>}
                valueSx={kpiValue}
                subtitle="Maximum loan limit: 15 items"
                icon={MenuBookOutlinedIcon}
              />
              <StatCard
                title="Overdue Loans"
                value={<Box component="span" sx={{ color: 'success.main' }}>{(libraryAccountSummary?.overdueItems ?? libraryAccountSummary?.overdue ?? 0)} Items</Box>}
                valueSx={kpiValue}
                subtitle="Good standing • No blocks"
                icon={WarningAmberRoundedIcon}
                tone="success"
              />
              <StatCard
                title="Outstanding Fines"
                value={<Box component="span" sx={{ color: 'success.main' }}>${(Number(libraryAccountSummary?.unpaidFines ?? libraryAccountSummary?.fines ?? 0)).toFixed(2)}</Box>}
                valueSx={kpiValue}
                subtitle="Zero penalty balance"
                icon={PaymentsOutlinedIcon}
                tone="success"
              />
              <StatCard
                title="Patron Barcode"
                value={libraryAccountSummary?.barcode || libraryAccountSummary?.patronId || 'LIB-984210'}
                valueSx={{ fontSize: { xs: '1.0625rem', md: '1.25rem' } }}
                subtitle="Demo University Main Library"
                icon={QrCode2RoundedIcon}
                tone="neutral"
              />
            </Box>

            {/* Checked Out Books */}
            <Section title={`Currently Borrowed Volumes (${checkedOutBooks.length})`}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
                {checkedOutBooks.map(book => (
                  <LibraryBookCard key={book.id} book={book} onRenew={handleRenewBook} />
                ))}
              </Box>
            </Section>

            {/* Catalog search */}
            <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <IconTile icon={TravelExploreOutlinedIcon} tone="info" size={36} />
                <Box>
                  <Typography variant="h6" component="h3">Library Discovery Catalog</Typography>
                  <Typography variant="caption">Search electronic journals, textbooks, physical reserve stacks, and academic databases.</Typography>
                </Box>
              </Stack>

              <TextField
                type="text"
                placeholder="Search catalog by title, author, subject, or ISBN..."
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: 'grey.400', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />

              {filteredCatalog.length > 0 && (
              <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                {filteredCatalog.map(item => {
                  const isAvailable = item.status === 'Available' || item.status === 'Online Access Available' || item.available === true;
                  return (
                    <Stack
                      key={item.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1}
                      sx={{ px: 2, py: 1.5, '& + &': { borderTop: 1, borderColor: 'divider' }, '&:hover': { bgcolor: 'background.subtle' } }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                        <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                          By {item.author} • Call Number: <Box component="strong" sx={{ color: 'text.primary' }}>{item.callNumber}</Box>
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>Location: {item.location}</Typography>
                      </Box>
                      <Badge variant={isAvailable ? 'success' : 'neutral'}>
                        {item.status || (isAvailable ? 'Available' : 'Checked Out')}
                      </Badge>
                    </Stack>
                  );
                })}
              </Box>
              )}
            </Card>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default LibraryPage;

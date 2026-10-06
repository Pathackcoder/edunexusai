import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import { DirectoryCard } from '../../components/directory/DirectoryCard';
import { PersonProfileDrawer } from '../../components/directory/PersonProfileDrawer';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { IconTile } from '../../components/common/IconTile';
import { useApiQuery } from '../../hooks/useApiQuery';
import { directoryApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

export const PeopleSearchPage = () => {
  // The whole visible directory is fetched once and filtered in the browser, matching
  // the prototype's instant-filter behaviour. The endpoint also supports server-side
  // search for when the directory grows past a single page.
  const { data, loading, error, refetch } = useApiQuery(() => directoryApi.search());
  const directoryData = data?.people ?? [];
  const directoryDepartments = data?.departments ?? ['All Departments'];
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [selectedType, setSelectedType] = useState('all'); // 'all', 'student', 'faculty', 'staff'
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [selectedPerson, setSelectedPerson] = useState(null);

  // Sync state if URL query changes
  useEffect(() => {
    if (urlQuery !== searchQuery) {
      setSearchQuery(urlQuery);
    }
  }, [urlQuery]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (val.trim()) {
      setSearchParams({ q: val });
    } else {
      setSearchParams({});
    }
  };

  const isSearchActive = searchQuery.trim().length > 0 || selectedType !== 'all' || selectedDepartment !== 'All Departments';

  const filteredDirectory = useMemo(() => {
    if (!isSearchActive) {
      return []; // SEARCH-FIRST: do not display directory records by default
    }

    return directoryData.filter(person => {
      // Type category filter
      if (selectedType !== 'all' && person.type !== selectedType) {
        return false;
      }
      // Department filter
      if (selectedDepartment !== 'All Departments' && person.department !== selectedDepartment) {
        return false;
      }
      // Query search
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const matchName = person.name.toLowerCase().includes(query);
        const matchRole = person.role.toLowerCase().includes(query);
        const matchDept = person.department.toLowerCase().includes(query);
        const matchEmail = person.email.toLowerCase().includes(query);
        const matchProgram = (person.program || '').toLowerCase().includes(query);
        return matchName || matchRole || matchDept || matchEmail || matchProgram;
      }
      return true;
    });
  }, [directoryData, searchQuery, selectedType, selectedDepartment, isSearchActive]);

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading the campus directory…"
      minHeight={320}
    >
      {() => (
        <Box>
          <PageHeader
            title="People Search"
            description="Find a student, faculty member, or staff member across Demo University."
          />

          <Stack spacing={2.5}>
            {/* Search & filters */}
            <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
              <TextField
                type="text"
                placeholder="Search by name, email, department or role..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus
                size="medium"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: 'grey.400' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleSearchChange('')} aria-label="Clear search" size="small" edge="end">
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />

              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mt: 2 }}>
                <FilterChips
                  ariaLabel="Filter by role"
                  value={selectedType}
                  onChange={setSelectedType}
                  options={[
                    { id: 'all', label: 'All Roles' },
                    { id: 'student', label: 'Students' },
                    { id: 'faculty', label: 'Faculty' },
                    { id: 'staff', label: 'Staff' }
                  ]}
                />

                <TextField
                  select
                  label="Department"
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  SelectProps={{ native: true }}
                  sx={{ width: { xs: '100%', md: 260 } }}
                >
                  <option value="All Departments">All Departments</option>
                  {directoryDepartments.filter(d => d !== 'All Departments').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </TextField>
              </Stack>
            </Card>

            {/* Search-first initial state */}
            {!isSearchActive && (
              <Card sx={{ py: { xs: 5, sm: 7 }, px: 3, textAlign: 'center' }}>
                <Stack alignItems="center" spacing={1.75}>
                  <IconTile icon={PersonSearchOutlinedIcon} tone="primary" size={64} sx={{ borderRadius: '50%' }} />
                  <Typography variant="h5" component="h3">Find a student, faculty member, or staff member</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440 }}>
                    Search the university directory to find people by typing their name, email, department, or academic role above.
                  </Typography>

                  <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" alignItems="center" spacing={1} sx={{ pt: 1 }}>
                    <Typography variant="caption">Try searching:</Typography>
                    {['Maya Lin', 'Dr. Marcus Vance', 'Sarah Jenkins', 'Computer Science'].map(term => (
                      <Chip
                        key={term}
                        label={`"${term}"`}
                        variant="outlined"
                        clickable
                        onClick={() => handleSearchChange(term)}
                        sx={{ borderColor: 'divider', color: 'text.secondary', '&:hover': { color: 'primary.main', borderColor: 'primary.light' } }}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Card>
            )}

            {/* Active search results */}
            {isSearchActive && (
              <Stack spacing={1.75}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    Results: <Box component="strong" sx={{ color: 'text.primary' }}>{filteredDirectory.length}</Box> {filteredDirectory.length === 1 ? 'person' : 'people'} found
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedType('all');
                      setSelectedDepartment('All Departments');
                      setSearchParams({});
                    }}
                    sx={{ color: 'primary.main' }}
                  >
                    Reset Search
                  </Button>
                </Stack>

                {filteredDirectory.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
                    {filteredDirectory.map(person => (
                      <DirectoryCard
                        key={person.id}
                        person={person}
                        onSelect={setSelectedPerson}
                      />
                    ))}
                  </Box>
                ) : (
                  <Card sx={{ py: 5, px: 2.5, textAlign: 'center' }}>
                    <GroupsOutlinedIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
                    <Typography variant="subtitle2">No university members match "{searchQuery}"</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
                      Try adjusting your search query, clearing filters, or checking spelling.
                    </Typography>
                  </Card>
                )}
              </Stack>
            )}
          </Stack>

          {/* Person profile drawer */}
          <PersonProfileDrawer
            open={!!selectedPerson}
            onClose={() => setSelectedPerson(null)}
            person={selectedPerson}
          />
        </Box>
      )}
    </DataState>
  );
};

export default PeopleSearchPage;

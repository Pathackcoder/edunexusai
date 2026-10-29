import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { PageHeader } from '../../components/common/PageHeader';
import { AnnouncementsFeedBlock } from '../../components/cms/blocks/CmsBlocks';

const CATEGORIES = ['all', 'general', 'academic', 'events', 'campus-life', 'finance', 'it-services', 'safety', 'wellness'];

/** Campus news & notices published in Studio for the user's audience (all personas). */
export function CampusNewsPage() {
  const [category, setCategory] = useState('all');
  return (
    <Box>
      <PageHeader
        title="News & Notices"
        description="Campus announcements from the university. Course announcements from your instructors stay on your courses."
        actions={
          <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c === 'all' ? 'All categories' : c.replace('-', ' ')}</MenuItem>)}
          </TextField>
        }
      />
      <AnnouncementsFeedBlock title="Latest notices" category={category} limit={50} layout="list" />
    </Box>
  );
}

export default CampusNewsPage;

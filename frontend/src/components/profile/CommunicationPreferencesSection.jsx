import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { WidgetCard } from '../common/WidgetCard';
import { useToast } from '../common/Toast';

const CHANNELS = [
  { key: 'email', label: 'Email', icon: MailOutlineRoundedIcon, aria: 'Email toggle' },
  { key: 'sms', label: 'SMS', icon: SmsOutlinedIcon, aria: 'SMS toggle' },
  { key: 'push', label: 'Push', icon: PhoneIphoneRoundedIcon, aria: 'Push notification toggle' },
];

/**
 * Preferences are owned by the page, which loads and saves them through the API. This
 * component holds only the in-progress edit so toggles feel instant before the save.
 */
export const CommunicationPreferencesSection = ({ preferences: initialPreferences = [], onSave }) => {
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the server returns a different set (initial load, or after a save).
  useEffect(() => {
    setPreferences(initialPreferences);
  }, [initialPreferences]);

  const toggleChannel = (categoryId, channel) => {
    setPreferences(prev =>
      prev.map(cat => {
        if (cat.id !== categoryId || cat.isMandatory) return cat;
        return {
          ...cat,
          channels: {
            ...cat.channels,
            [channel]: !cat.channels[channel]
          }
        };
      })
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(preferences);
      } else {
        showToast('No save handler is configured for these preferences.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSave}>
      <WidgetCard
        title="Communication Channels & Dispatch Preferences"
        subtitle="Select the delivery channels for different categories of institutional announcements. Essential security and emergency notices cannot be turned off."
        icon={NotificationsActiveOutlinedIcon}
        tone="info"
      >
        <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
          <Table sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell>Notification Category</TableCell>
                {CHANNELS.map(({ key, label, icon: Icon }) => (
                  <TableCell key={key} align="center" sx={{ width: 96 }}>
                    <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                      <Icon sx={{ fontSize: 15 }} />
                      <span>{label}</span>
                    </Stack>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {preferences.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
                      <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                      {item.isMandatory && <Badge variant="danger" dot>Required</Badge>}
                    </Stack>
                    <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>{item.description}</Typography>
                  </TableCell>

                  {CHANNELS.map(({ key, aria }) => (
                    <TableCell key={key} align="center">
                      {item.isMandatory ? (
                        <Tooltip title="Mandatory notification">
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.25} sx={{ color: 'text.secondary' }}>
                            <LockOutlinedIcon sx={{ fontSize: 14, color: 'grey.400' }} />
                            <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>Always</Typography>
                          </Stack>
                        </Tooltip>
                      ) : (
                        <Checkbox
                          checked={item.channels[key]}
                          onChange={() => toggleChannel(item.id, key)}
                          inputProps={{ 'aria-label': `${item.title} ${aria}` }}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.25 }}>
          <Button type="submit" variant="primary" icon={SaveOutlinedIcon} loading={isSaving}>
            Save Preferences
          </Button>
        </Stack>
      </WidgetCard>
    </Box>
  );
};

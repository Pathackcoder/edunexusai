import React from 'react';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import Typography from '@mui/material/Typography';
import { WidgetCard } from '../common/WidgetCard';
export const AdminEmergencyBroadcastWidget = () => <WidgetCard title="Urgent campus communication" tone="urgent" icon={WarningAmberRoundedIcon} accentBorder="left" actionLabel="Prepare urgent notice" actionTo="/notifications?urgent=1">
  <Typography variant="body2" color="text.secondary">Compose an urgent notice in the Communication Center. It is delivered in-app to the selected audience immediately; SMS and phone alerting are not connected.</Typography>
</WidgetCard>;
export default AdminEmergencyBroadcastWidget;

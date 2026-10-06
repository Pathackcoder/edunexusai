import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useI18n } from './index';

/** Header language switcher. Shows the current language code next to the icon. */
export function LanguageSelector() {
  const { locale, languages, setLocale, t } = useI18n();
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Tooltip title={t('Language')}>
        <IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label={`${t('Language')}: ${locale}`} sx={{ gap: 0.25 }}>
          <TranslateRoundedIcon fontSize="small" />
          <Typography component="span" sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', display: { xs: 'none', sm: 'inline' } }}>
            {locale}
          </Typography>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {languages.map((language) => (
          <MenuItem
            key={language.code}
            selected={language.code === locale}
            onClick={() => {
              setLocale(language.code);
              setAnchor(null);
            }}
            sx={{ minWidth: 200 }}
          >
            <ListItemText primary={language.nativeLabel} secondary={language.label} />
            <Box sx={{ width: 20, display: 'flex', color: 'primary.main' }}>{language.code === locale && <CheckRoundedIcon fontSize="small" />}</Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

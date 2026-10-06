import React from 'react';
import Stack from '@mui/material/Stack';
import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';

/**
 * Segmented filter control. Purely presentational: the parent owns the value and
 * decides what each option filters.
 *
 *   <FilterChips value={filter} onChange={setFilter}
 *     options={[{ id: 'all', label: 'All', count: 12 }, …]} />
 */
export const FilterChips = ({ options, value, onChange, sx, ariaLabel = 'Filter' }) => (
  <Stack
    role="group"
    aria-label={ariaLabel}
    direction="row"
    useFlexGap
    flexWrap="wrap"
    spacing={0.75}
    sx={{ p: 0.5, borderRadius: 3, bgcolor: 'grey.50', border: 1, borderColor: 'divider', width: 'fit-content', maxWidth: '100%', ...sx }}
  >
    {options.map((option) => {
      const active = value === option.id;
      return (
        <ButtonBase
          key={option.id}
          onClick={() => onChange(option.id)}
          aria-pressed={active}
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            height: 32,
            px: 1.5,
            borderRadius: 2.25,
            typography: 'body2',
            fontWeight: active ? 600 : 500,
            whiteSpace: 'nowrap',
            color: active ? 'text.primary' : 'text.secondary',
            bgcolor: active ? 'background.paper' : 'transparent',
            boxShadow: active ? theme.shadows[2] : 'none',
            transition: 'background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
            '&:hover': { color: 'text.primary', bgcolor: active ? 'background.paper' : alpha(theme.palette.grey[900], 0.04) },
          })}
        >
          {option.icon}
          {option.label}
          {option.count !== undefined && (
            <Box
              component="span"
              sx={(theme) => ({
                minWidth: 20,
                height: 18,
                px: 0.625,
                borderRadius: 9,
                fontSize: '0.6875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : theme.palette.grey[100],
                color: active ? 'primary.main' : 'text.secondary',
              })}
            >
              {option.count}
            </Box>
          )}
        </ButtonBase>
      );
    })}
  </Stack>
);

export default FilterChips;

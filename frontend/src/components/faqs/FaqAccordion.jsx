import React, { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';

export const FaqAccordion = ({ items }) => {
  const [openId, setOpenId] = useState(null);

  const toggleItem = (id) => {
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      {items.map(faq => {
        const isOpen = openId === faq.id;

        return (
          <Accordion
            key={faq.id}
            expanded={isOpen}
            onChange={() => toggleItem(faq.id)}
            TransitionProps={{ unmountOnExit: true }}
            sx={(theme) => ({
              mt: '0 !important',
              bgcolor: 'background.paper',
              borderColor: isOpen ? alpha(theme.palette.primary.main, 0.3) : 'divider',
              boxShadow: isOpen ? theme.shadows[2] : 'none',
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
            })}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreRoundedIcon sx={{ color: isOpen ? 'primary.main' : 'grey.400' }} />}
              sx={{ '&:hover': { bgcolor: 'background.subtle' }, borderRadius: 3 }}
            >
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <HelpOutlineRoundedIcon sx={{ fontSize: 19, color: isOpen ? 'primary.main' : 'grey.400', flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={600} sx={{ color: isOpen ? 'primary.main' : 'text.primary' }}>
                  {faq.question}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pl: { xs: 2.25, sm: 6 } }}>
              <Typography variant="body2" color="text.secondary">
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
};

import { z } from 'zod';

export const submitAssignmentSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  submissionRef: z.string().trim().max(200).optional(),
});

export const transcriptRequestSchema = z.object({
  deliveryType: z.string().trim().min(3, 'Choose a delivery type.').max(120),
  recipient: z.string().trim().min(2, 'Recipient is required.').max(200),
  recipientEmail: z.string().trim().email('Enter a valid email.').max(200).optional().or(z.literal('')),
  recipientAddress: z.string().trim().max(500).optional(),
  copies: z.coerce.number().int().min(1, 'At least one copy.').max(10, 'Maximum 10 copies.').default(1),
  notes: z.string().trim().max(1000).optional(),
});

export const calendarQuerySchema = z.object({
  category: z.string().trim().max(50).optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid('Expected a resource id.') });

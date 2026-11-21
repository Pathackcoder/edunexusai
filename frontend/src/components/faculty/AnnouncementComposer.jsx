import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useToast } from '../common/Toast';
import { ReadOnlyNotice, useReadOnly } from '../../viewAs/ReadOnly';
import { facultyApi } from '../../services/api';
import { ANNOUNCEMENT_LIMITS, OWNER_LABEL, composerSections, sectionLabel } from '../../pages/faculty/teachingState';

const EMPTY = { sectionId: '', title: '', body: '', pinned: false };

/**
 * Compose a class announcement for one of the faculty member's sections. It is published in the system that owns
 * the section, never the other one, and nothing is stored in EduNexusAI:
 *   CampusCore-owned  CampusCore class announcement, as the faculty member, to the section's registered students
 *   Moodle-owned      the mapped Moodle course's Announcements forum; Moodle records the integration account as the
 *                     author, so the faculty member is named in the message
 * Sections that cannot take one right now are listed as unavailable, with the server's reason.
 *
 * `data` is the GET /faculty/sections (or /faculty/announcements) response. A fresh idempotency key is made for each
 * new content, so retrying the same announcement after a network failure can never post it twice.
 */
export function AnnouncementComposer({ open, onClose, data, initialSectionId = '', onPublished }) {
  const { showToast } = useToast();
  const readOnly = useReadOnly();
  const { postable, blocked } = composerSections(data);
  const [form, setForm] = useState(EMPTY);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, sectionId: initialSectionId || (postable.length === 1 ? postable[0].source.id : '') });
    setKey(crypto.randomUUID());
    setError(null);
  }, [open, initialSectionId]); // reset only when the dialog opens; `postable` is re-derived on every render

  // Any change makes it a different announcement, so it gets a new key.
  const change = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setKey(crypto.randomUUID());
  };

  const fieldErrors = error?.fieldErrors ?? {};
  const target = postable.find((s) => s.source.id === form.sectionId);

  const submit = async (event) => {
    event.preventDefault();
    if (!target) return setError({ message: 'Choose one of your sections.' });
    setSending(true);
    setError(null);
    try {
      const published = await facultyApi.publishAnnouncement(target.source.id, { title: form.title, body: form.body, pinned: form.pinned, idempotencyKey: key });
      showToast(`Announcement published to ${sectionLabel(target)} in ${OWNER_LABEL[target.announcementOwner] ?? 'CampusCore'}.`);
      onPublished?.(published);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="New class announcement"
      subtitle="Published in the system that owns the section: CampusCore or Moodle"
      footer={(
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="announcement-composer" variant="primary" size="sm" loading={sending} icon={CampaignOutlinedIcon} disabled={!target} mutates>
            Publish
          </Button>
        </Stack>
      )}
    >
      <Stack component="form" id="announcement-composer" onSubmit={submit} spacing={2.25}>
        {readOnly && <ReadOnlyNotice />}
        {postable.length === 0 && (
          <Alert severity="info">None of your sections can take an announcement from EduNexusAI right now{blocked[0] ? `: ${blocked[0].reason}` : '.'}</Alert>
        )}
        <TextField
          select
          label="Section"
          value={form.sectionId}
          onChange={(e) => change({ sectionId: e.target.value })}
          required
          disabled={postable.length === 0}
        >
          {postable.map((s) => (
            <MenuItem key={s.source.id} value={s.source.id}>{sectionLabel(s)} · {s.courseTitle} ({s.termCode})</MenuItem>
          ))}
          {blocked.map(({ section, reason }) => (
            <MenuItem key={section.source.id} value={section.source.id} disabled>
              <Stack>
                <span>{sectionLabel(section)} · {section.courseTitle} ({section.termCode})</span>
                <Typography variant="caption" sx={{ whiteSpace: 'normal' }}>{reason}</Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
        <TextField
          id="announcement-title"
          label="Title"
          value={form.title}
          onChange={(e) => change({ title: e.target.value })}
          required
          inputProps={{ maxLength: ANNOUNCEMENT_LIMITS.title }}
          error={Boolean(fieldErrors.title)}
          helperText={fieldErrors.title ?? `${form.title.length}/${ANNOUNCEMENT_LIMITS.title}`}
        />
        <TextField
          id="announcement-body"
          label="Message"
          multiline
          rows={6}
          value={form.body}
          onChange={(e) => change({ body: e.target.value })}
          required
          inputProps={{ maxLength: ANNOUNCEMENT_LIMITS.body }}
          error={Boolean(fieldErrors.body)}
          helperText={fieldErrors.body ?? `${form.body.length}/${ANNOUNCEMENT_LIMITS.body}`}
        />
        <FormControlLabel
          control={<Checkbox checked={form.pinned} onChange={(e) => change({ pinned: e.target.checked })} />}
          label="Pin to the top of the class announcements"
        />
        {target && target.announcementOwner === 'MOODLE' && (
          <Alert severity="info" variant="outlined">
            Posted to the Announcements forum of the Moodle course {target.moodleCourse?.shortName ?? target.moodleCourse?.moodleCourseId}. Moodle will
            show the author as <strong>{data?.publishing?.moodle?.postsAs ?? 'the EduNexusAI integration account'}</strong>; your name is added at the end of
            the message. Moodle e-mails the forum’s subscribers on its own schedule (normally after its editing window). To edit or delete it, use the
            Moodle course.
          </Alert>
        )}
        {target && target.announcementOwner !== 'MOODLE' && (
          <Typography variant="caption" color="text.secondary">
            Visible right away to the students registered in {sectionLabel(target)}, with you as the author. It cannot be edited or removed from EduNexusAI afterwards; the registrar can do that in CampusCore.
          </Typography>
        )}
        {error && !Object.keys(fieldErrors).length && <Alert severity="error">{error.message}</Alert>}
      </Stack>
    </Modal>
  );
}

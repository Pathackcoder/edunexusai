import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import ButtonBase from '@mui/material/ButtonBase';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableFooter from '@mui/material/TableFooter';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Chip from '@mui/material/Chip';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { IconTile } from '../common/IconTile';
import { MetricLabel } from '../common/Section';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../common/DataState';

const EMPTY_SUMMARY = {};

const SummaryField = ({ label, children }) => (
  <Box sx={{ minWidth: 0 }}>
    <MetricLabel sx={{ fontSize: '0.625rem' }}>{label}</MetricLabel>
    <Box sx={{ typography: 'body2', fontWeight: 600, mt: 0.25 }}>{children}</Box>
  </Box>
);

/**
 * The unofficial transcript. Summary and term history come from GET /transcripts, which
 * reads the registrar-owned academic record rows out of PostgreSQL.
 */
export const UnofficialTranscriptView = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => academicApi.getTranscript());
  const transcriptSummary = data?.summary ?? EMPTY_SUMMARY;
  const transcriptTerms = data?.terms ?? [];

  // Terms arrive from the server, so expansion state is derived rather than seeded.
  const [collapsedTerms, setCollapsedTerms] = useState({});
  const expandedTerms = transcriptTerms.reduce(
    (acc, term) => ({ ...acc, [term.term]: !collapsedTerms[term.term] }),
    {},
  );

  const toggleTerm = (termName) => {
    setCollapsedTerms((prev) => ({ ...prev, [termName]: !prev[termName] }));
  };

  const handlePrintDownload = () => {
    showToast(
      `Generating official watermark PDF for ${transcriptSummary.studentName ?? 'this student'} (${transcriptSummary.studentId ?? ''})...`,
    );
    setTimeout(() => {
      window.print();
    }, 400);
  };

  const gradeColor = (grade) =>
    grade && String(grade).startsWith('A') ? 'success.main' : grade === 'IP' ? 'warning.main' : 'text.primary';

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your academic record…"
      isEmpty={transcriptTerms.length === 0}
      emptyTitle="No academic history yet"
      emptyMessage="Completed terms will appear here once grades are posted."
    >
      {() => (
        <Stack spacing={2}>
          {/* Action Header */}
          <Card sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <IconTile icon={DescriptionOutlinedIcon} tone="primary" size={36} />
                <Box>
                  <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                    Official-Format Unofficial Academic Transcript
                  </Typography>
                  <Typography variant="caption">
                    Certified record for internal university advising and personal student evaluation.
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button size="sm" variant="secondary" icon={PrintOutlinedIcon} onClick={handlePrintDownload}>
                  Print
                </Button>
                <Button size="sm" variant="primary" icon={FileDownloadOutlinedIcon} onClick={handlePrintDownload}>
                  Download PDF
                </Button>
              </Stack>
            </Stack>
          </Card>

          {/* Academic Document Sheet */}
          <Card className="transcript-document-sheet" sx={{ p: { xs: 2.5, sm: 4 }, boxShadow: 3 }}>
            {/* Institutional header */}
            <Box sx={{ pb: 2.5, mb: 3, borderBottom: 2, borderColor: 'primary.main' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}>
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box component="img" src="/logo.png" alt="EdunexusAI" sx={{ height: 30, width: 'auto' }} />
                    <Typography variant="h4" component="span">Demo University</Typography>
                  </Stack>
                  <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
                    Office of the University Registrar • Student Records Division • 100 University Plaza, Boston MA 02115
                  </Typography>
                </Box>
                <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={0.75} sx={{ flexShrink: 0 }}>
                  <Chip
                    icon={<VerifiedUserOutlinedIcon />}
                    label="AUTHENTICATED RECORD"
                    sx={{ bgcolor: 'primary.lighter', color: 'primary.dark', fontSize: '0.6875rem', letterSpacing: '0.04em', '& .MuiChip-icon': { color: 'primary.main' } }}
                  />
                  <Typography variant="caption">
                    Date Issued: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Typography>
                </Stack>
              </Stack>

              {/* Student metadata */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' },
                  gap: 2,
                  mt: 2.5,
                  p: 2,
                  bgcolor: 'background.subtle',
                  borderRadius: 3,
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <SummaryField label="Student Name">{transcriptSummary.studentName}</SummaryField>
                <SummaryField label="Student Identification">{transcriptSummary.studentId}</SummaryField>
                <SummaryField label="Academic Career / Degree">{transcriptSummary.degree}</SummaryField>
                <SummaryField label="Department">
                  <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}>{transcriptSummary.program}</Box>
                </SummaryField>
                <SummaryField label="Cumulative GPA">
                  <Box component="span" sx={{ color: 'primary.main', fontFamily: 'Rubik, sans-serif', fontSize: '1rem' }}>
                    {Number(transcriptSummary.cumulativeGpa ?? 0).toFixed(2)}
                  </Box>
                </SummaryField>
                <SummaryField label="Credits Earned / Required">
                  {transcriptSummary.creditsEarned} / {transcriptSummary.totalDegreeRequirement} credits
                </SummaryField>
              </Box>
            </Box>

            {/* Academic terms */}
            <Stack spacing={2}>
              {transcriptTerms.map((termData) => {
                const isExpanded = expandedTerms[termData.term];

                return (
                  <Box key={termData.term} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                    {/* Term header */}
                    <ButtonBase
                      onClick={() => toggleTerm(termData.term)}
                      aria-expanded={isExpanded}
                      sx={{
                        width: '100%',
                        px: 2,
                        py: 1.5,
                        bgcolor: 'background.subtle',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                        textAlign: 'left',
                        '&:hover': { bgcolor: 'grey.100' },
                      }}
                    >
                      <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1.25}>
                        <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>{termData.term}</Typography>
                        <Badge variant={termData.isInProgress ? 'warning' : 'primary'}>{termData.level}</Badge>
                        {termData.academicStanding && !termData.isInProgress && (
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>
                            • {termData.academicStanding}
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={2} sx={{ flexShrink: 0 }}>
                        <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.secondary' }}>
                          Term GPA: <Box component="strong" sx={{ color: 'text.primary' }}>{termData.termGpa}</Box> | Credits:{' '}
                          <Box component="strong" sx={{ color: 'text.primary' }}>{termData.creditsAttempted}</Box>
                        </Typography>
                        <ExpandMoreRoundedIcon
                          sx={{ fontSize: 20, color: 'grey.500', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
                        />
                      </Stack>
                    </ButtonBase>

                    {/* Term courses */}
                    <Collapse in={isExpanded} timeout={220} unmountOnExit>
                      <TableContainer sx={{ borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
                        <Table size="small" sx={{ minWidth: 560 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ bgcolor: 'background.paper' }}>Course</TableCell>
                              <TableCell sx={{ bgcolor: 'background.paper' }}>Course Title</TableCell>
                              <TableCell align="center" sx={{ bgcolor: 'background.paper' }}>Credits</TableCell>
                              <TableCell align="center" sx={{ bgcolor: 'background.paper' }}>Grade</TableCell>
                              <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>Points</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {termData.courses.map((course) => (
                              <TableRow key={course.code} hover>
                                <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{course.code}</TableCell>
                                <TableCell>{course.title}</TableCell>
                                <TableCell align="center" sx={{ color: 'text.secondary' }}>{course.credits}.00</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700, color: gradeColor(course?.grade) }}>
                                  {course.grade || 'IP'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>{course.points}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow sx={{ bgcolor: 'background.subtle', '& td': { borderTop: 2, borderColor: 'divider', borderBottom: 0, fontSize: '0.8125rem', color: 'text.secondary' } }}>
                              <TableCell colSpan={2} sx={{ fontWeight: 700, color: 'text.primary !important' }}>
                                Term Totals ({termData.term})
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.primary !important' }}>
                                {termData.creditsAttempted}.00
                              </TableCell>
                              <TableCell colSpan={2} align="right">
                                Term GPA: <Box component="strong" sx={{ color: 'text.primary' }}>{termData.termGpa}</Box> • Cumulative GPA:{' '}
                                <Box component="strong" sx={{ color: 'primary.main' }}>{termData.cumulativeGpa.toFixed(2)}</Box>
                              </TableCell>
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </TableContainer>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>

            {/* Document footer */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={1}
              sx={{ mt: 3.5, pt: 2, borderTop: 1, borderColor: 'divider' }}
            >
              <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>
                END OF UNOFFICIAL TRANSCRIPT RECORD — RECORD AS OF {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>Security Identifier: SHA256-ENX-8829-410</Typography>
            </Stack>
          </Card>
        </Stack>
      )}
    </DataState>
  );
};

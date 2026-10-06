import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unexpected error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 4 }}>
          <Paper variant="outlined" sx={{ maxWidth: 480, width: '100%', p: { xs: 3, sm: 4 }, textAlign: 'center', boxShadow: 3 }}>
            <Stack alignItems="center" spacing={2}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  bgcolor: 'error.lighter',
                  color: 'error.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ReportProblemOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="h4" component="h2">
                  Something went wrong
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  An unexpected component error occurred in this view. The application has safely recovered.
                </Typography>
              </Box>

              {this.state.error && (
                <Box
                  component="details"
                  sx={{
                    width: '100%',
                    textAlign: 'left',
                    bgcolor: 'background.subtle',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    px: 1.5,
                    py: 1.25,
                    typography: 'caption',
                    color: 'error.dark',
                    overflowX: 'auto',
                  }}
                >
                  <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>
                    Error Details
                  </Box>
                  <Box component="pre" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
                    {this.state.error.toString()}
                  </Box>
                </Box>
              )}

              <Button variant="contained" startIcon={<HomeOutlinedIcon />} onClick={this.handleReset}>
                Return to Dashboard
              </Button>
            </Stack>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

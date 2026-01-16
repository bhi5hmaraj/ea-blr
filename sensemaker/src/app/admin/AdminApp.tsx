'use client';

import { Admin, Resource } from 'react-admin';
import { createTheme } from '@mui/material/styles';
import { createDataProvider } from './dataProvider';
import { ListingList, ObservationCreate, ObservationList, RevisionList } from './resources';
import { AdminError } from './adminError';

const dataProvider = createDataProvider();

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2c5e4d',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#c36b4e',
    },
    background: {
      default: '#f6f1e9',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'var(--font-sans), "Space Grotesk", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.04em',
    },
    h2: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 14,
  },
});

export default function AdminApp() {
  return (
    <div className="admin-shell">
      <section className="admin-hero">
        <h1>Sensemaker Admin</h1>
        <p>
          Review observations, approve revisions, and publish trusted listings. This dashboard stays
          deliberately minimal so you can move fast with human-in-the-loop curation.
        </p>
      </section>

      <section className="admin-card">
        <Admin dataProvider={dataProvider} theme={theme} error={AdminError} disableTelemetry>
          <Resource name="observations" list={ObservationList} create={ObservationCreate} />
          <Resource name="revisions" list={RevisionList} />
          <Resource name="listings" list={ListingList} />
        </Admin>
      </section>
    </div>
  );
}

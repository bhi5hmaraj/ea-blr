// Vercel serverless function entry point
// Imports the pre-compiled Express app from dist/
// The dist/ directory is created by our build command before this runs
import app from '../dist/index.js';

export default app;

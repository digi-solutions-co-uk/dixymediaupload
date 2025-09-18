# Dixy Media Uploader

A React-based media uploader for images and videos with AWS S3 integration.

## Features

- Drag & drop file selection for images and videos
- Real-time upload progress tracking
- AWS S3 integration via Firebase Cloud Functions
- Responsive design with modern UI
- File preview and management

## Live Demo

Visit the live application: [https://digi-solutions-co-uk.github.io/dixymediaupload/](https://digi-solutions-co-uk.github.io/dixymediaupload/)

## Tech Stack

- React 19
- Vite
- Firebase Cloud Functions
- AWS S3
- Axios

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This project is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the main branch.

## Configuration

The app connects to Firebase Cloud Functions for AWS S3 operations:
- `generatePresignedUrl` - Generates presigned URLs for S3 operations
- `writeAllMedia` - Server-side write to allmedia.json

## License

Private project for Digi Solutions.
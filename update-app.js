const fs = require('fs');

// Read the current App.jsx
let content = fs.readFileSync('src/App.jsx', 'utf8');

// Add the READ_ALL_MEDIA_ENDPOINT
content = content.replace(
  '  const WRITE_ALL_MEDIA_ENDPOINT = IS_DEV',
  '  const WRITE_ALL_MEDIA_ENDPOINT = IS_DEV'
);

content = content.replace(
  '    : \'https://us-central1-digislidesapp.cloudfunctions.net/writeAllMedia\'',
  '    : \'https://us-central1-digislidesapp.cloudfunctions.net/writeAllMedia\'\n  const READ_ALL_MEDIA_ENDPOINT = IS_DEV\n    ? \'/readAllMedia\'\n    : \'https://us-central1-digislidesapp.cloudfunctions.net/readAllMedia\''
);

// Update the readAllMediaFromS3 function
content = content.replace(
  `  const readAllMediaFromS3 = async () => {
    try {
      const readUrl = await getPreSignedURLForAllMedia('read')
      if (!readUrl) return []
      // In dev, route through Vite proxy to bypass S3 CORS
      const devUrl = IS_DEV && readUrl.startsWith('https://digisolutions-assets.s3.eu-west-1.amazonaws.com')
        ? readUrl.replace('https://digisolutions-assets.s3.eu-west-1.amazonaws.com', '/s3')
        : readUrl
      const res = await axios.get(devUrl, { responseType: 'json' })
      const data = res.data
      return Array.isArray(data) ? data : []
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 404) return []
        console.error('Error reading allmedia.json:', e.response?.status, e.response?.data || e.message)
      } else {
        console.error('Error reading allmedia.json:', e)
      }
      return []
    }
  }`,
  `  const readAllMediaFromS3 = async () => {
    try {
      const res = await axios.get(READ_ALL_MEDIA_ENDPOINT, { responseType: 'json' })
      const data = res.data
      return Array.isArray(data) ? data : []
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 404) return []
        console.error('Error reading allmedia.json:', e.response?.status, e.response?.data || e.message)
      } else {
        console.error('Error reading allmedia.json:', e)
      }
      return []
    }
  }`
);

// Write the updated content
fs.writeFileSync('src/App.jsx', content);
console.log('Updated App.jsx successfully');

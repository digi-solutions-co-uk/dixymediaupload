import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import './App.css'
import logo from './assets/dixy_logo.svg'

function App() {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  // AWS Manager endpoint to generate pre-signed URLs
  // In dev, use Vite proxy to avoid CORS. In prod, use absolute URL.
  const IS_DEV = Boolean(import.meta && import.meta.env && import.meta.env.DEV)
  const PRESIGN_ENDPOINT = IS_DEV
    ? '/generatePresignedUrl'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/generatePresignedUrl'
  const UPLOAD_API_BASE = IS_DEV
    ? '/uploadApi'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/uploadApi'
  const WRITE_ALL_MEDIA_ENDPOINT = IS_DEV
    ? '/writeAllMedia'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/writeAllMedia'
  const READ_ALL_MEDIA_ENDPOINT = IS_DEV
    ? '/readAllMedia'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/readAllMedia'

  const getPreSignedURLForAllMedia = async (operationType = 'write') => {
    try {
      const { data } = await axios.post(
        PRESIGN_ENDPOINT,
        { folderPath: 'slideconfig/dixymedia/config/allmedia.json', operationType },
        { headers: { 'Content-Type': 'application/json' } }
      )
      // Normalize possible shapes
      if (typeof data === 'string') return data
      if (data?.url) return data.url
      if (data?.signedUrl) return data.signedUrl
      if (data?.signedURL) return data.signedURL
      if (data?.putUrl) return data.putUrl
      if (data?.data && typeof data.data === 'string') return data.data
      console.error('Unexpected presign response shape:', data)
      return null
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Error fetching pre-signed URL:', error.response?.status, error.response?.data || error.message)
      } else {
        console.error('Error fetching pre-signed URL:', error)
      }
      return null
    }
  }

  const writeToS3WithPreSignedURLAllMedia = async (jsonPayload) => {
    try {
      const signedURL = await getPreSignedURLForAllMedia('write')
      console.log('signedURL', signedURL)
      console.log('jsonPayload', jsonPayload)
      if (!signedURL) throw new Error('No pre-signed URL returned')
      await axios.put(
        signedURL,
        jsonPayload,
        { headers: { 'Content-Type': 'application/json' } }
      )
      return true
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.error('Error writing to S3 for all media:', e.response?.status, e.response?.data || e.message)
      } else {
        console.error('Error writing to S3 for all media:', e)
      }
      return false
    }
  }

  const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const mapUploadedToAllMedia = (items) => {
    return items.map(it => {
      const id = generateId()
      if (it.type === 'video') {
        return { itemId: id, type: 'Video', videoUrl: it.fileUrl, previewUrl: it.fileUrl }
      }
      return { itemId: id, type: 'Image', uri: it.fileUrl }
    })
  }

  const readAllMediaFromS3 = async () => {
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
  }

  const updateAllMediaJson = async (uploadedMapped) => {
    try {
      const existing = await readAllMediaFromS3()
      const newItems = mapUploadedToAllMedia(uploadedMapped)
      const combined = [...existing, ...newItems]
      const ok = await axios.post(WRITE_ALL_MEDIA_ENDPOINT, { items: combined }, { headers: { 'Content-Type': 'application/json' } })
        .then(() => true)
        .catch((e) => {
          if (axios.isAxiosError(e)) {
            console.error('Error writing allmedia.json:', e.response?.status, e.response?.data || e.message)
          } else {
            console.error('Error writing allmedia.json:', e)
          }
          return false
        })
      return ok
    } catch (error) {
      console.error('Error updating all media JSON:', error)
      return false
    }
  }

  useEffect(() => {
    return () => {
      // Revoke object URLs on unmount
      selectedFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
    }
  }, [selectedFiles])

  const acceptTypes = useMemo(() => 'image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/avi,video/mov,video/wmv,video/flv,video/webm', [])

  const onChooseFiles = (e) => {
    console.log('File input changed:', e.target.files)
    const files = Array.from(e.target.files || [])
    console.log('Files selected:', files.length)
    if (!files.length) return

    const filtered = files.filter(f => (f.type || '').startsWith('image/') || (f.type || '').startsWith('video/'))
    if (filtered.length !== files.length) {
      window.alert('Only images and videos are allowed.')
    }

    const mapped = filtered.map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: (file.type || '').startsWith('video/') ? 'video' : 'image',
      mimeType: file.type || '',
      previewUrl: URL.createObjectURL(file),
    }))

    setSelectedFiles(prev => [...prev, ...mapped])
    // reset input value to allow re-selecting the same file
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    const filtered = files.filter(f => (f.type || '').startsWith('image/') || (f.type || '').startsWith('video/'))
    if (filtered.length !== files.length) {
      window.alert('Only images and videos are allowed.')
    }
    const mapped = filtered.map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: (file.type || '').startsWith('video/') ? 'video' : 'image',
      mimeType: file.type || '',
      previewUrl: URL.createObjectURL(file),
    }))
    setSelectedFiles(prev => [...prev, ...mapped])
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragActive) setDragActive(true)
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const openFileDialog = () => {
    console.log('Opening file dialog, uploading:', uploading)
    if (fileInputRef.current) {
      console.log('File input ref exists, clicking...')
      fileInputRef.current.click()
    } else {
      console.log('File input ref not found')
    }
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
    setUploadProgress(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const result = reader.result || ''
        const base64 = String(result).split(',')[1] || ''
        resolve(base64)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const uploadToS3 = async () => {
    if (!selectedFiles.length) {
      window.alert('Please select files to upload.')
      return
    }

    setUploading(true)
    setUploadedFiles([])

    // Initialize progress
    const initial = {}
    selectedFiles.forEach((_, idx) => { initial[idx] = 0 })
    setUploadProgress(initial)

    try {
      const filesData = []
      for (let i = 0; i < selectedFiles.length; i += 1) {
        const item = selectedFiles[i]
        const base64 = await fileToBase64(item.file)
        filesData.push({
          name: item.name,
          data: base64,
          type: item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        })
        setUploadProgress(prev => ({ ...prev, [i]: Math.round(((i + 1) / selectedFiles.length) * 50) }))
      }

      const folder = 'slideconfig/dixymedia'

      const { data: result } = await axios.post(
        `${UPLOAD_API_BASE}/upload`,
        { files: filesData },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          params: { folder },
        }
      )
      const uploaded = Array.isArray(result.uploaded) ? result.uploaded : []

      const complete = {}
      selectedFiles.forEach((_, idx) => { complete[idx] = 100 })
      setUploadProgress(complete)

      const mapped = uploaded.map((u, idx) => ({
        fileName: selectedFiles[idx]?.name || `file_${idx}`,
        fileUrl: u.url,
        type: selectedFiles[idx]?.type,
        response: u,
      }))
      setUploadedFiles(mapped)

      // Write/append media list to S3 allmedia.json via pre-signed URL
      const writeOk = await updateAllMediaJson(mapped)

      window.alert(`${mapped.length} file(s) uploaded successfully.${writeOk ? '' : '\nNote: Saving allmedia.json failed. Check console for details.'}`)
      // Clear selected files and progress after successful upload
      selectedFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
      setSelectedFiles([])
      setUploadProgress({})
    } catch (err) {
      console.error('Upload error:', err)
      window.alert(`Failed to upload files: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
      <img src={logo} alt="Dixy Logo" style={{ width: 200, height: 200}} />
      <h1 style={{ marginBottom: 8 }}>Dixy Media Uploader</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>Select images and videos to upload to Dixy Media.</p>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 12, marginBottom: 16 }}>
        {/** Button style helpers */}
        {(() => { return null })()}
        {/** Define inline style objects */}
        { /* eslint-disable no-unused-vars */ }
        { /* Using inline objects for clarity and reuse */ }
        { /* These are not rendered; just variables */ }
        {(() => {
          const primaryBase = {
            padding: '10px 16px',
            background: '#183CB4',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }
          const secondaryBase = {
            padding: '10px 16px',
            background: 'transparent',
            color: '#183CB4',
            border: '1px solid #183CB4',
            borderRadius: 8,
            cursor: 'pointer'
          }
          // Attach to window for reuse in JSX below without re-creating each render block
          window.__btnPrimary = primaryBase
          window.__btnSecondary = secondaryBase
          window.__btnDisabled = { opacity: 0.6, cursor: 'not-allowed' }
          return null
        })()}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          multiple
          onChange={onChooseFiles}
          style={{ display: 'none' }}
          disabled={uploading}
        />

        <div
          onClick={openFileDialog}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFileDialog() }}
          style={{
            width: '100%',
            border: '2px dashed ' + (dragActive ? '#3b82f6' : '#cbd5e1'),
            background: dragActive ? '#eff6ff' : '#fafafa',
            color: '#374151',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease-in-out',
            outline: 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {dragActive ? 'Drop files to add' : 'Drag & drop images or videos here'}
          </div>
          <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>
            PNG, JPG, GIF, MP4, MOV
          </div>
          <div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); openFileDialog() }}
              disabled={uploading}
              style={{
                ...(window.__btnPrimary || {}),
                ...(uploading ? (window.__btnDisabled || {}) : {}),
              }}
            >
              Browse files
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={uploadToS3}
            disabled={uploading || selectedFiles.length === 0}
            style={{
              ...(window.__btnPrimary || {}),
              ...((uploading || selectedFiles.length === 0) ? (window.__btnDisabled || {}) : {}),
            }}
          >
            {uploading ? 'Uploading…' : `Upload ${selectedFiles.length || ''}`}
          </button>

          {selectedFiles.length > 0 && !uploading && (
            <button
              onClick={() => {
                selectedFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
                setSelectedFiles([])
                setUploadProgress({})
              }}
              style={{ ...(window.__btnSecondary || {}) }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>Selected Files</strong>
            <span style={{ color: '#666' }}>{selectedFiles.length} file(s)</span>
          </div>

          {selectedFiles.map((item, index) => (
            <div key={`${item.name}-${index}`} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>{(item.size / (1024 * 1024)).toFixed(2)} MB</div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={uploading}
                  aria-label={`Remove ${item.name}`}
                  title="Remove"
                  style={{
                    width: 36,
                    height: 36,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 8,
                    border: '1px solid #ef4444',
                    background: '#fff1f2',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    color: '#b91c1c'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                    <path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-4h6l1 1h4v2H4V4h4l1-1zm1 6h2v9h-2V9zm4 0h2v9h-2V9z"/>
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                {item.type === 'video' ? (
                  <video src={item.previewUrl} controls style={{ width: '100%', maxHeight: 260, borderRadius: 6 }} />
                ) : (
                  <img src={item.previewUrl} alt={item.name} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6 }} />
                )}
              </div>

              {uploadProgress[index] !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ position: 'relative', width: '100%', height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${uploadProgress[index]}%`, background: '#16a34a' }} />
                  </div>
                  <div style={{ width: 40, textAlign: 'right', color: '#666', fontSize: 12 }}>{uploadProgress[index]}%</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Uploaded</div>
          <ul style={{ paddingLeft: 18 }}>
            {uploadedFiles.map((f, i) => (
              <li key={`${f.fileName}-${i}`} style={{ marginBottom: 6 }}>
                <a href={f.fileUrl} target="_blank" rel="noreferrer">{f.fileName}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App

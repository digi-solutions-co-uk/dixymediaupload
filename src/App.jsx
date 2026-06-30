import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { database } from './firebase'
import { digiAuth } from './firebase2'
import { ref, get } from 'firebase/database'
import Login from './components/Login'
import './App.css'
import logo from './assets/dixy_logo.svg'

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [stores, setStores] = useState([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storesError, setStoresError] = useState('')
  const [selectedStore, setSelectedStore] = useState(null)
  const fileInputRef = useRef(null)

  // AWS Manager endpoint to generate pre-signed URLs
  // In dev, use Vite proxy to avoid CORS. In prod, use absolute URL.
  const IS_DEV = Boolean(import.meta && import.meta.env && import.meta.env.DEV)
  const AUTH_PRESIGN_ENDPOINT = IS_DEV
    ? '/s3AuthGeneratePresignedUrl'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/s3AuthGeneratePresignedUrl'
  const UPLOAD_API_BASE = IS_DEV
    ? '/uploadApi'
    : 'https://us-central1-digislidesapp.cloudfunctions.net/uploadApi'

  const getPreSignedURLForAllMedia = async (operationType = 'write') => {
    try {
      let token = ''
      if (digiAuth.currentUser) {
        token = await digiAuth.currentUser.getIdToken(true)
      }
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const endpoint = AUTH_PRESIGN_ENDPOINT
      const payload = operationType === 'write'
        ? { s3Key: 'slideconfig/dixymedia/config/allmedia.json', operationType, expiresIn: 900 }
        : { folderPath: 'slideconfig/dixymedia/config/allmedia.json', operationType }

      const { data } = await axios.post(
        endpoint,
        payload,
        { headers }
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
      // console.log('signedURL', signedURL)
      // console.log('jsonPayload', jsonPayload)
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
        return {
          itemId: id,
          type: 'Video',
          videoUrl: it.fileUrl,
          previewUrl: it.fileUrl,
          storeId: selectedStore?.store_id,
          postcode: selectedStore?.postcode,
        }
      }
      return {
        itemId: id,
        type: 'Image',
        uri: it.fileUrl,
        storeId: selectedStore?.store_id,
        postcode: selectedStore?.postcode,
      }
    })
  }

  const readAllMediaFromS3 = async () => {
    try {

      const signedURL = await getPreSignedURLForAllMedia('read')
      if (!signedURL) return []
      const res = await axios.get(signedURL, {
        headers: { 'Cache-Control': 'no-cache' },
        responseType: 'json'
      })
      const data = res.data
      return Array.isArray(data) ? data : []
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 404 || e.response?.status === 403) return [] // Might not exist yet
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
      const ok = await writeToS3WithPreSignedURLAllMedia(combined)
      return ok
    } catch (error) {
      console.error('Error updating all media JSON:', error)
      return false
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(digiAuth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    return () => {
      // Revoke object URLs on unmount
      selectedFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
    }
  }, [selectedFiles])

  // Fetch branches list from Firebase Realtime Database
  useEffect(() => {
    if (!user) return

    const fetchStores = async () => {
      setStoresLoading(true)
      setStoresError('')

      // Try Firebase Realtime Database first
      try {
        // console.log('Fetching stores from Firebase Realtime Database...')
        // Path in Realtime Database - adjust if your path is different
        const storesRef = ref(database, 'stores')
        const snapshot = await get(storesRef)

        if (snapshot.exists()) {
          const data = snapshot.val()
          // Handle both array and object formats
          let list = []
          if (Array.isArray(data)) {
            list = data
          } else if (typeof data === 'object') {
            // If it's an object, convert to array
            list = Object.values(data)
          }

          if (list.length > 0) {
            // console.log(`Successfully loaded ${list.length} stores from Firebase Realtime Database`)
            setStores(list)
            setStoresError('')
            setStoresLoading(false)
            return
          }
        } else {
          console.warn('No data found at Firebase path: allstores')
        }
      } catch (err) {
        console.warn('Firebase Realtime Database fetch failed:', err.message)
      }

      // All endpoints failed
      setStoresError('Failed to load branches list. Please refresh or check network.')
      console.error('All fetch attempts failed')
      setStoresLoading(false)
    }
    fetchStores()
  }, [user])

  const acceptTypes = useMemo(() => 'image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/avi,video/mov,video/wmv,video/flv,video/webm', [])

  const handleSignOut = async () => {
    try {
      await signOut(digiAuth)
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  const onChooseFiles = (e) => {
    // console.log('=== FILE INPUT EVENT ===')
    // console.log('Event type:', e.type)
    // console.log('Target:', e.target)
    // console.log('Files:', e.target.files)
    // console.log('Files length:', e.target.files?.length)

    const files = Array.from(e.target.files || [])
    // console.log('Files array:', files)
    // console.log('Files selected:', files.length)

    if (!files.length) {
      // console.log('No files selected, returning early')
      return
    }

    const filtered = files.filter(f => (f.type || '').startsWith('image/') || (f.type || '').startsWith('video/'))
    // console.log('Filtered files:', filtered.length)
    // console.log('Filtered files details:', filtered.map(f => ({ name: f.name, type: f.type })))

    if (filtered.length !== files.length) {
      // console.log('Some files were filtered out')
      window.alert('Only images and videos are allowed.')
    }

    if (filtered.length === 0) {
      // console.log('No valid files after filtering')
      return
    }

    const mapped = filtered.map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: (file.type || '').startsWith('video/') ? 'video' : 'image',
      mimeType: file.type || '',
      previewUrl: URL.createObjectURL(file),
    }))

    // console.log('Mapped files:', mapped)
    // console.log('Adding files to selectedFiles:', mapped.length)

    setSelectedFiles(prev => {
      // console.log('Previous selectedFiles:', prev.length)
      const newFiles = [...prev, ...mapped]
      // console.log('New selectedFiles:', newFiles.length)
      // console.log('New files details:', newFiles.map(f => ({ name: f.name, type: f.type })))
      return newFiles
    })

    // Reset input value to allow re-selecting the same file
    e.target.value = ''
    // console.log('=== END FILE INPUT EVENT ===')
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
    // console.log('=== OPEN FILE DIALOG ===')
    // console.log('Uploading state:', uploading)
    // console.log('File input ref:', fileInputRef.current)
    // console.log('File input disabled:', fileInputRef.current?.disabled)

    if (fileInputRef.current) {
      // console.log('File input ref exists, clicking...')
      // Reset the input value to ensure it triggers onChange even for the same files
      fileInputRef.current.value = ''
      fileInputRef.current.click()
      // console.log('File input clicked')
    } else {
      // console.log('File input ref not found')
    }
    // console.log('=== END OPEN FILE DIALOG ===')
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
    if (!selectedStore) {
      window.alert('Please select a branch before uploading.')
      return
    }
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

      let token = ''
      if (digiAuth.currentUser) {
        token = await digiAuth.currentUser.getIdToken(true)
      }
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const { data: result } = await axios.post(
        `${UPLOAD_API_BASE}/upload`,
        { files: filesData },
        {
          headers,
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
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#64748b', fontSize: 14 }}>{user.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: '#183CB4',
              border: '1px solid #183CB4',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      <img src={logo} alt="Dixy Logo" style={{ width: 200, height: 200 }} />
      <h1 style={{ marginBottom: 8 }}>Dixy Media Uploader</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>Select images and videos to upload to Dixy Media.</p>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 12, marginBottom: 16 }}>
        {/* Branch selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
          <label htmlFor="branch-select" style={{ fontWeight: 600 }}>Select Branch</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              id="branch-select"
              value={selectedStore?.store_id || ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                const found = stores.find(s => s.store_id === id) || null
                setSelectedStore(found)
              }}
              disabled={storesLoading}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 260 }}
            >
              <option value="" disabled>{storesLoading ? 'Loading branches…' : 'Choose a branch'}</option>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.name} ({s.postcode || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          {storesError && (<div style={{ color: '#b91c1c', fontSize: 13 }}>{storesError}</div>)}
          {!storesLoading && !storesError && stores.length === 0 && (
            <div style={{ color: '#f59e0b', fontSize: 13 }}>No branches found. Check console for details.</div>
          )}
          {stores.length > 0 && (
            <div style={{ color: '#10b981', fontSize: 12 }}>Loaded {stores.length} branch(es)</div>
          )}
        </div>
        {selectedStore && (
          <div style={{ color: '#374151', fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>Store ID:</span> {selectedStore.store_id} &nbsp;|&nbsp; <span style={{ fontWeight: 600 }}>Postcode:</span> {selectedStore.postcode || 'N/A'}
          </div>
        )}
        {/** Button style helpers */}
        {(() => { return null })()}
        {/** Define inline style objects */}
        { /* eslint-disable no-unused-vars */}
        { /* Using inline objects for clarity and reuse */}
        { /* These are not rendered; just variables */}
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
              onClick={(e) => { e.stopPropagation(); openFileDialog(); }}
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
                    <path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-4h6l1 1h4v2H4V4h4l1-1zm1 6h2v9h-2V9zm4 0h2v9h-2V9z" />
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

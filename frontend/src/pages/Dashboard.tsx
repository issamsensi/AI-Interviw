import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Briefcase, Loader2, ArrowRight, Brain } from 'lucide-react'
import { useInterviewStore } from '../store/useInterviewStore'
import type { ResumeAnalysis, InterviewPlan } from '../types'

const API = 'http://localhost:8000/api'

const ROLES = [
  'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'Data Scientist', 'ML Engineer', 'DevOps Engineer',
  'Mobile Developer', 'Product Manager', 'Software Engineer',
]

export default function Dashboard() {
  const navigate = useNavigate()
  const store = useInterviewStore()

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('')
  const [seniority, setSeniority] = useState<'junior' | 'mid' | 'senior'>('mid')
  const [jobDesc, setJobDesc] = useState('')
  const [duration, setDuration] = useState(10)
  const [customRole, setCustomRole] = useState('')
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)

  const handleUpload = useCallback(async () => {
    if (!file) return
    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('user_id', 'default')

      const uploadRes = await fetch(`${API}/upload-resume`, { method: 'POST', body: formData })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const uploadData = await uploadRes.json()

      store.setResumeId(uploadData.resume_id)

      setAnalyzing(true)
      const analyzeRes = await fetch(`${API}/analyze-resume?resume_id=${uploadData.resume_id}`, { method: 'POST' })
      if (!analyzeRes.ok) throw new Error('Analysis failed')
      const analyzeData = await analyzeRes.json()

      const parsed = analyzeData.analysis as ResumeAnalysis
      setAnalysis(parsed)
      store.setResumeAnalysis(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }, [file, store])

  const handleStartInterview = useCallback(async () => {
    const selectedRole = role === 'custom' ? customRole : role
    if (!selectedRole || !store.resumeId) return

    setStarting(true)
    setError('')

    try {
      const res = await fetch(`${API}/start-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: store.resumeId,
          role: selectedRole,
          seniority,
          job_description: jobDesc || undefined,
          duration_minutes: duration,
          user_id: 'default',
        }),
      })
      if (!res.ok) throw new Error('Failed to start interview')
      const data: InterviewPlan = await res.json()

      store.setInterviewPlan(data)
      store.setInterviewId(data.interview_id)
      navigate(`/interview/${data.interview_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start interview')
    } finally {
      setStarting(false)
    }
  }, [role, customRole, seniority, jobDesc, duration, store, navigate])

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-2">
          <Brain className="w-6 h-6 text-brand-500" />
          <span className="font-bold">InterviewAI</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Start Your Interview</h1>
        <p className="text-gray-400 mb-10">Upload your resume and configure your interview session.</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand-400" />
              Upload Resume
            </h2>

            {!analysis ? (
              <>
                <label className="block border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500/50 transition-colors">
                  <FileText className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 mb-1">
                    {file ? file.name : 'Drop your CV here or click to browse'}
                  </p>
                  <p className="text-gray-600 text-sm">PDF or image supported</p>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>

                <button
                  onClick={handleUpload}
                  disabled={!file || uploading || analyzing}
                  className="btn-primary w-full mt-4"
                >
                  {uploading || analyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploading ? 'Uploading...' : 'Analyzing...'}
                    </span>
                  ) : (
                    'Analyze Resume'
                  )}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.skills.slice(0, 8).map((s, i) => (
                      <span key={i} className="bg-brand-500/10 text-brand-400 text-xs px-2.5 py-1 rounded-full">{s}</span>
                    ))}
                    {analysis.skills.length > 8 && (
                      <span className="text-gray-500 text-xs py-1">+{analysis.skills.length - 8} more</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">Projects ({analysis.projects.length})</p>
                  <p className="text-sm">{analysis.projects.map(p => p.name).join(', ')}</p>
                </div>
                <button
                  onClick={() => { setAnalysis(null); setFile(null); (store as any).setResumeAnalysis(null) }}
                  className="text-sm text-brand-400 hover:underline"
                >
                  Upload different resume
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand-400" />
              Interview Config
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Job Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a role</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="custom">Custom role...</option>
                </select>
                {role === 'custom' && (
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="Enter your role"
                    className="input-field mt-2"
                  />
                )}
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Seniority</label>
                <div className="flex gap-2">
                  {(['junior', 'mid', 'senior'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeniority(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        seniority === s
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Job Description (optional)</label>
                <textarea
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Paste job description here..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Duration: <span className="text-brand-400 font-semibold">{duration} min</span>
                </label>
                <input
                  type="range"
                  min={2}
                  max={20}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>2 min</span>
                  <span>20 min</span>
                </div>
              </div>

              <button
                onClick={handleStartInterview}
                disabled={!role || (!analysis) || starting}
                className="btn-primary w-full"
              >
                {starting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Start Interview
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

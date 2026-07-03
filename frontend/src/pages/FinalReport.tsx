import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Brain, TrendingUp, AlertTriangle, Lightbulb, CheckCircle, XCircle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import type { InterviewReport } from '../types'

const API = 'http://localhost:8000/api'

const COLORS = ['#22c55e', '#eab308', '#ef4444']

export default function FinalReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`${API}/report/${id}`)
      .then((res) => res.json())
      .then((data) => setReport(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading report...</p>
        </div>
      </div>
    )
  }

  if (!report || !report.evaluation) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Report not found</p>
      </div>
    )
  }

  const { evaluation, qa_pairs } = report

  const pieData = [
    { name: 'Correct', value: evaluation.overall_score },
    { name: 'Partial', value: Math.max(0, 100 - evaluation.overall_score - 10) },
    { name: 'Needs Work', value: 10 },
  ]

  const barData = qa_pairs.map((qa, i) => ({
    name: `Q${i + 1}`,
    score: evaluation.question_scores?.[qa.question] || 0,
  }))

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-brand-500" />
            <span className="font-bold">InterviewAI</span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary text-sm py-2 px-4"
          >
            <ArrowLeft className="w-4 h-4 inline mr-1" />
            New Interview
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2">Interview Report</h1>
          <p className="text-gray-400">
            {report.role} &middot; {report.seniority}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="card flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
                {evaluation.overall_score}
              </div>
              <p className="text-gray-400 mt-2">Overall Score</p>
              <div className="w-48 h-48 mx-auto mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Strengths
            </h3>
            <ul className="space-y-2 mb-6">
              {evaluation.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Weaknesses
            </h3>
            <ul className="space-y-2 mb-6">
              {evaluation.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-brand-400" />
              Suggestions
            </h3>
            <ul className="space-y-2">
              {evaluation.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <Lightbulb className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card mb-8">
          <h3 className="text-lg font-semibold mb-4">Question Breakdown</h3>
          {barData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <XAxis dataKey="name" stroke="#6b7280" />
                  <YAxis domain={[0, 100]} stroke="#6b7280" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="score" fill="#5c7cfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Transcript</h3>
          {qa_pairs.map((qa, i) => (
            <div key={i} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-brand-500/10 text-brand-400 text-xs px-2 py-0.5 rounded-full">
                  Q{i + 1}
                </span>
                <span className="text-xs text-gray-500">{qa.category}</span>
              </div>
              <p className="text-white mb-2">{qa.question}</p>
              {qa.answer ? (
                <p className="text-gray-400 text-sm">{qa.answer}</p>
              ) : (
                <p className="text-gray-600 text-sm italic">No answer provided</p>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

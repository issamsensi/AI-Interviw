import { useNavigate } from 'react-router-dom'
import { Brain, Mic, FileText, BarChart3, ArrowRight, Sparkles } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-8 h-8 text-brand-500" />
            <span className="text-xl font-bold">InterviewAI</span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary text-sm py-2 px-4"
          >
            Get Started
          </button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 text-sm text-brand-400 mb-8">
          <Sparkles className="w-4 h-4" />
          AI-Powered Mock Interviews
        </div>
        <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
          Ace Your Next
          <br />
          <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
            Technical Interview
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Practice with an AI interviewer that adapts to your resume, asks realistic questions,
          and provides detailed feedback on your performance.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 inline-flex items-center gap-2"
        >
          Start Your Interview
          <ArrowRight className="w-5 h-5" />
        </button>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {[
            { icon: FileText, title: 'Upload Resume', desc: 'Upload your CV and our AI analyzes your skills, projects, and experience.' },
            { icon: Brain, title: 'AI Generates Questions', desc: 'Questions are tailored to your background and target role.' },
            { icon: Mic, title: 'Live Interview', desc: 'Real-time voice conversation with webcam presence. Feels like the real thing.' },
            { icon: BarChart3, title: 'Get Feedback', desc: 'Comprehensive evaluation with scores, strengths, and improvement areas.' },
          ].map((item, i) => (
            <div key={i} className="card text-center hover:border-brand-500/50 transition-all duration-300">
              <div className="w-14 h-14 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <item.icon className="w-7 h-7 text-brand-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="card bg-gradient-to-r from-brand-600/10 to-purple-600/10 border-brand-500/20 p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Practice?</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            No sign-up required. Upload your resume and start your interview in minutes.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary text-lg"
          >
            Start Free Interview
          </button>
        </div>
      </section>

      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        AI Interview Simulator &mdash; Practice makes perfect.
      </footer>
    </div>
  )
}

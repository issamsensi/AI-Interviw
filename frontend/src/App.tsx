import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import InterviewRoom from './pages/InterviewRoom'
import FinalReport from './pages/FinalReport'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/interview/:id" element={<InterviewRoom />} />
      <Route path="/report/:id" element={<FinalReport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import { Mic, MicOff, PhoneOff, Clock, Loader2, AlertTriangle, Send, Square } from 'lucide-react'
import { useInterviewStore } from '../store/useInterviewStore'
import { InterviewSocket } from '../lib/socket'
import AISpeakingIndicator from '../components/AISpeakingIndicator'

export default function InterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useInterviewStore()
  const webcamRef = useRef<Webcam>(null)
  const socketRef = useRef<InterviewSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [connected, setConnected] = useState(false)
  const [question, setQuestion] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [phase, setPhase] = useState<'countdown' | 'connecting' | 'interview' | 'ending'>('connecting')
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [timeWarning, setTimeWarning] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const questionTextRef = useRef('')
  const handleEndRef = useRef<() => void>(() => {})
  const startRecordingRef = useRef<() => void>(() => {})

  const speak = (text: string) => {
    if (!text || !window.speechSynthesis) {
      startRecordingRef.current()
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => {
      store.setAiSpeaking(false)
      setAiSpeaking(false)
      startRecordingRef.current()
    }
    utterance.onerror = () => {
      store.setAiSpeaking(false)
      setAiSpeaking(false)
    }
    window.speechSynthesis.speak(utterance)
  }

  const totalQuestions = store.interviewPlan?.question_count || 0
  const durationMinutes = store.interviewPlan?.duration_minutes || 10
  const totalSeconds = durationMinutes * 60
  const remaining = Math.max(0, totalSeconds - elapsed)

  useEffect(() => {
    if (!id) return

    const socket = new InterviewSocket(id)
    socketRef.current = socket

    let speakTimeout: ReturnType<typeof setTimeout> | null = null

    socket.connect(
      (data) => {
        if (data.type === 'question') {
          setQuestion(data.text)
          questionTextRef.current = data.text
          if (data.order !== undefined) setQuestionIndex(data.order + 1)
          store.setAiSpeaking(true)
          setAiSpeaking(true)
          speakTimeout = setTimeout(() => {
            speak(data.text)
          }, 800)
        } else if (data.type === 'answer_ack') {
          store.setRecording(false)
        } else if (data.type === 'interview_end' || data.type === 'interview_ended') {
          setPhase('ending')
          fetch(`http://localhost:8000/api/end-interview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interview_id: id }),
          }).catch(() => {}).finally(() => {
            setTimeout(() => {
              navigate(`/report/${id}`)
            }, 2000)
          })
        }
      },
      (blob) => {
        if (speakTimeout) clearTimeout(speakTimeout)
        window.speechSynthesis.cancel()
        const url = URL.createObjectURL(blob)
        if (audioRef.current) {
          audioRef.current.src = url
          audioRef.current.play().then(() => {
            audioRef.current!.onended = () => {
              store.setAiSpeaking(false)
              setAiSpeaking(false)
              URL.revokeObjectURL(url)
              startRecordingRef.current()
            }
          }).catch(() => {
            store.setAiSpeaking(false)
            setAiSpeaking(false)
            speak(questionTextRef.current)
          })
        }
      },
      () => { /* error */ },
    ).then(() => {
      setConnected(true)
      setPhase('countdown')
    }).catch(() => {
      setPhase('countdown')
    })

    return () => {
      socket.disconnect()
      mediaRecorderRef.current?.stop()
    }
  }, [id])

  useEffect(() => {
    if (phase === 'countdown' && connected) {
      const interval = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(interval)
            setPhase('interview')
            return 3
          }
          return c - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [phase, connected])

  useEffect(() => {
    if (phase !== 'interview') return
    const timer = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1
        if (totalSeconds - next <= 60) setTimeWarning(true)
        if (next >= totalSeconds) {
          clearInterval(timer)
          handleEndRef.current()
        }
        return next
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase, totalSeconds])

  const startRecording = useCallback(() => {
    if (!store.isMuted && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        audioChunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }
        recorder.onstop = () => {
          store.setRecording(false)
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          socketRef.current?.send({
            action: 'answer',
            text: '',
            current_question: question,
            resume_data: store.resumeAnalysis,
            remaining_questions: [],
          })
          if (socketRef.current) {
            socketRef.current.sendAudio(blob)
          }
          stream.getTracks().forEach(t => t.stop())
        }
        recorder.start()
        mediaRecorderRef.current = recorder
        store.setRecording(true)
        setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            stopRecording()
          }
        }, 30000)
      }).catch(() => {
        store.setRecording(false)
      })
    }
  }, [store.isMuted, question, store.resumeAnalysis, store])

  startRecordingRef.current = startRecording

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleEnd = useCallback(() => {
    mediaRecorderRef.current?.stop()
    socketRef.current?.send({ action: 'end_interview' })
    setPhase('ending')
    fetch(`http://localhost:8000/api/end-interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interview_id: id }),
    }).catch(() => {}).finally(() => {
      setTimeout(() => {
        if (id) navigate(`/report/${id}`)
      }, 2000)
    })
  }, [id, navigate])

  handleEndRef.current = handleEnd

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {phase === 'connecting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-brand-500 mx-auto mb-4" />
            <p className="text-gray-400">Connecting to interview...</p>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-8xl font-bold text-brand-500 mb-4">{countdown}</div>
            <p className="text-gray-400">Get ready...</p>
          </div>
        </div>
      )}

      {phase === 'interview' && (
        <>
          {timeWarning && (
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2 flex items-center justify-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Less than 1 minute remaining
            </div>
          )}
          <div className="flex-1 grid grid-cols-5 gap-4 p-4">
            <div className="col-span-3 relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800">
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-gray-300">You</span>
              </div>
            </div>

            <div className="col-span-2 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              {aiSpeaking ? (
                <AISpeakingIndicator />
              ) : store.isRecording ? (
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                  </div>
                  <p className="text-sm text-red-400 font-medium">Recording...</p>
                  <p className="text-xs text-gray-500 mt-1">Click Send when done</p>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <Mic className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">Listening...</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-800 p-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm text-gray-400 mb-1">
                  Question {questionIndex} of {totalQuestions}
                </p>
                <p className="text-lg font-medium truncate">{question || 'Waiting for question...'}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 text-sm mr-2 ${
                  timeWarning ? 'text-red-400' : 'text-gray-400'
                }`}>
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(remaining)}</span>
                </div>

                {store.isRecording && !aiSpeaking && (
                  <button
                    onClick={stopRecording}
                    className="bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-xl transition-all"
                    title="Send Answer"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={() => store.toggleMute()}
                  className={`p-3 rounded-xl transition-all ${
                    store.isMuted ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {store.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleEnd}
                  className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl transition-all"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {phase === 'ending' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
            <p className="text-xl font-semibold mb-2">Interview Complete!</p>
            <p className="text-gray-400">Generating your feedback report...</p>
          </div>
        </div>
      )}
    </div>
  )
}

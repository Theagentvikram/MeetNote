"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Play, 
  Pause, 
  Mic, 
  MicOff, 
  Maximize2, 
  Share,
  Sparkles,
  Clock,
  Users,
  MessageCircle
} from 'lucide-react'

const demoSteps = [
  {
    id: 1,
    title: "Meeting Detection",
    description: "Extension automatically detects when you're on a meeting platform",
    action: "Auto-detected Zoom meeting",
    duration: 2000
  },
  {
    id: 2,
    title: "One-Click Recording",
    description: "Click the MeetNote extension icon to start recording instantly",
    action: "Recording started",
    duration: 3000
  },
  {
    id: 3,
    title: "Live Transcription",
    description: "Real-time transcript appears as speakers talk",
    action: "Transcribing speech...",
    duration: 4000
  },
  {
    id: 4,
    title: "AI Highlights",
    description: "AI identifies important moments and suggests highlights",
    action: "Created highlight: 'Product roadmap discussion'",
    duration: 3000
  },
  {
    id: 5,
    title: "Instant Sharing",
    description: "Share insights directly to your preferred platforms",
    action: "Shared to #product-team Slack",
    duration: 2000
  }
]

const transcriptLines = [
  { speaker: "Sarah Johnson", text: "Let's discuss the Q4 product roadmap and priorities", timestamp: "14:23", isHighlight: true },
  { speaker: "Mike Chen", text: "I think we should focus on the mobile app features first", timestamp: "14:25", isHighlight: false },
  { speaker: "Sarah Johnson", text: "That's a great point. Our user feedback shows mobile is critical", timestamp: "14:27", isHighlight: true },
  { speaker: "Alex Rivera", text: "What about the integration with the new CRM system?", timestamp: "14:29", isHighlight: false },
  { speaker: "Sarah Johnson", text: "We'll need to allocate 3 sprints for the CRM integration", timestamp: "14:31", isHighlight: true }
]

export default function InteractiveDemo() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcriptIndex, setTranscriptIndex] = useState(0)
  const [highlights, setHighlights] = useState(0)

  useEffect(() => {
    if (isPlaying && currentStep < demoSteps.length) {
      const timer = setTimeout(() => {
        if (currentStep === 1) setIsRecording(true)
        if (currentStep === 2) {
          // Simulate transcript progression
          const transcriptTimer = setInterval(() => {
            setTranscriptIndex(prev => {
              if (prev >= transcriptLines.length - 1) {
                clearInterval(transcriptTimer)
                return prev
              }
              return prev + 1
            })
          }, 800)
        }
        if (currentStep === 3) setHighlights(prev => prev + 1)
        
        setCurrentStep(prev => prev + 1)
      }, demoSteps[currentStep]?.duration || 2000)

      return () => clearTimeout(timer)
    }
  }, [isPlaying, currentStep])

  const startDemo = () => {
    setIsPlaying(true)
    setCurrentStep(0)
    setIsRecording(false)
    setTranscriptIndex(0)
    setHighlights(0)
  }

  const resetDemo = () => {
    setIsPlaying(false)
    setCurrentStep(0)
    setIsRecording(false)
    setTranscriptIndex(0)
    setHighlights(0)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Demo Controls */}
      <div className="text-center mb-8">
        <div className="flex justify-center gap-4 mb-4">
          {!isPlaying ? (
            <Button onClick={startDemo} size="lg" className="gap-2">
              <Play className="w-5 h-5" />
              Start Interactive Demo
            </Button>
          ) : (
            <Button onClick={resetDemo} variant="outline" size="lg" className="gap-2">
              <Pause className="w-5 h-5" />
              Reset Demo
            </Button>
          )}
        </div>
        
        {/* Progress Steps */}
        <div className="flex justify-center items-center gap-2 mb-6">
          {demoSteps.map((_, index) => (
            <div
              key={index}
              className={`w-3 h-3 rounded-full transition-colors ${
                index <= currentStep 
                  ? 'bg-blue-600' 
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Current Step Info */}
        {isPlaying && currentStep < demoSteps.length && (
          <div className="text-center">
            <h3 className="font-semibold text-lg mb-2">
              Step {currentStep + 1}: {demoSteps[currentStep]?.title}
            </h3>
            <p className="text-muted-foreground">
              {demoSteps[currentStep]?.description}
            </p>
          </div>
        )}
      </div>

      {/* Demo Interface */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Simulated Meeting Window */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="ml-4 text-sm text-gray-300">zoom.us/meeting</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-red-600 text-white">
                  <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                  LIVE
                </Badge>
              </div>
            </div>
            
            <CardContent className="p-0 relative">
              {/* Meeting Video Area */}
              <div className="aspect-video bg-gradient-to-br from-blue-900/20 to-purple-900/20 flex items-center justify-center relative">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-300">Product Team Meeting</p>
                  <p className="text-sm text-gray-400">3 participants</p>
                </div>

                {/* Extension Overlay */}
                {currentStep >= 1 && (
                  <div className="absolute top-4 right-4 bg-white text-black rounded-lg shadow-xl p-3 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                        <span className="text-white font-bold text-xs">G</span>
                      </div>
                      <span className="font-semibold text-sm">MeetNote Extension</span>
                      {isRecording && (
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    
                    {currentStep >= 2 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Mic className="w-3 h-3" />
                          <span>Recording: 02:34</span>
                        </div>
                        
                        {currentStep >= 4 && (
                          <div className="flex items-center gap-2 text-xs text-green-600">
                            <Sparkles className="w-3 h-3" />
                            <span>{highlights} highlights created</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Meeting Controls */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-800/80 rounded-full px-6 py-3">
                  <Button size="sm" variant="ghost" className="text-white hover:text-white hover:bg-white/20">
                    <Mic className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-white hover:text-white hover:bg-white/20">
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-white hover:text-white hover:bg-white/20">
                    <Share className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transcript Panel */}
        <div className="space-y-4">
          {currentStep >= 2 && (
            <Card className="animate-in slide-in-from-right-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-semibold text-sm">Live Transcript</span>
                </div>
                
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {transcriptLines.slice(0, transcriptIndex + 1).map((line, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{line.timestamp}</span>
                        <span className="text-xs font-medium">{line.speaker}</span>
                        {line.isHighlight && currentStep >= 3 && (
                          <Sparkles className="w-3 h-3 text-yellow-500" />
                        )}
                      </div>
                      <p className={`text-sm ${line.isHighlight && currentStep >= 3 ? 'bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded' : ''}`}>
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Items */}
          {currentStep >= 4 && (
            <Card className="animate-in slide-in-from-right-2">
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Insights
                </h4>
                
                <div className="space-y-2">
                  <div className="text-xs">
                    <div className="font-medium text-green-600 mb-1">Key Decision:</div>
                    <p className="text-muted-foreground">Focus on mobile app features for Q4</p>
                  </div>
                  
                  <div className="text-xs">
                    <div className="font-medium text-blue-600 mb-1">Action Item:</div>
                    <p className="text-muted-foreground">Allocate 3 sprints for CRM integration</p>
                  </div>

                  {currentStep >= 5 && (
                    <Button size="sm" className="w-full mt-3 gap-1">
                      <Share className="w-3 h-3" />
                      Shared to Slack
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Demo Completion */}
      {currentStep >= demoSteps.length && (
        <div className="text-center mt-8 p-6 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 rounded-lg">
          <h3 className="text-xl font-bold mb-2">Demo Complete! 🎉</h3>
          <p className="text-muted-foreground mb-4">
            See how MeetNote can transform your meeting workflow with just a few clicks.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={resetDemo} variant="outline">
              Watch Again
            </Button>
            <Button>
              Install Extension
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}